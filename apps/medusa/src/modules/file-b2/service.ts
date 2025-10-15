import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
  AbstractFileProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  FileTypes,
  Logger,
  S3FileServiceOptions,
} from "@medusajs/framework/types"
import path from "path"
import { ulid } from "ulid"

type InjectedDependencies = {
  logger: Logger
}

interface B2S3FileServiceConfig {
  fileUrl: string
  accessKeyId?: string
  secretAccessKey?: string
  authenticationMethod?: "access-key" | "s3-iam-role"
  region: string
  bucket: string
  prefix?: string
  endpoint?: string
  cacheControl?: string
  downloadFileDuration?: number
  additionalClientConfig?: Record<string, any>
}

const DEFAULT_UPLOAD_EXPIRATION_DURATION_SECONDS = 60 * 60

class B2S3FileService extends AbstractFileProviderService {
  static identifier = "b2-s3"

  protected config_: B2S3FileServiceConfig
  protected logger_: Logger
  protected client_: S3Client

  constructor(
    { logger }: InjectedDependencies,
    options: S3FileServiceOptions
  ) {
    super()

    const authenticationMethod = options.authentication_method ?? "access-key"
    if (
      authenticationMethod === "access-key" &&
      (!options.access_key_id || !options.secret_access_key)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Access key ID and secret access key are required when using access key authentication`
      )
    }

    this.config_ = {
      fileUrl: options.file_url!,
      accessKeyId: options.access_key_id,
      secretAccessKey: options.secret_access_key,
      authenticationMethod,
      region: options.region!,
      bucket: options.bucket!,
      prefix: options.prefix ?? "",
      endpoint: options.endpoint,
      cacheControl: options.cache_control ?? "public, max-age=31536000",
      downloadFileDuration: options.download_file_duration ?? 60 * 60,
      additionalClientConfig: options.additional_client_config ?? {},
    }

    this.logger_ = logger
    this.client_ = this.getClient()
  }

  protected getClient(): S3Client {
    const credentials =
      this.config_.authenticationMethod === "access-key"
        ? {
            accessKeyId: this.config_.accessKeyId!,
            secretAccessKey: this.config_.secretAccessKey!,
          }
        : undefined

    const config = {
      credentials,
      region: this.config_.region,
      endpoint: this.config_.endpoint,
      ...this.config_.additionalClientConfig,
    }

    return new S3Client(config)
  }

  async upload(
    file: FileTypes.ProviderUploadFileDTO
  ): Promise<FileTypes.ProviderFileResultDTO> {
    if (!file) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No file provided`
      )
    }
    if (!file.filename) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No filename provided`
      )
    }

    const parsedFilename = path.parse(file.filename)
    const fileKey = `${this.config_.prefix}${parsedFilename.name}-${ulid()}${parsedFilename.ext}`
    const content = Buffer.from(file.content, "binary")

    // Important: DO NOT set ACL header for Backblaze B2 (S3-compat)
    const command = new PutObjectCommand({
      Bucket: this.config_.bucket,
      Body: content,
      Key: fileKey,
      ContentType: file.mimeType,
      CacheControl: this.config_.cacheControl,
      Metadata: {
        "x-amz-meta-original-filename": file.filename,
      },
    })

    try {
      await this.client_.send(command)
    } catch (e) {
      this.logger_.error(e as any)
      throw e
    }

    return {
      url: `${this.config_.fileUrl}/${fileKey}`,
      key: fileKey,
    }
  }

  async delete(
    files: FileTypes.ProviderDeleteFileDTO | FileTypes.ProviderDeleteFileDTO[]
  ): Promise<void> {
    try {
      if (Array.isArray(files)) {
        await this.client_.send(
          new DeleteObjectsCommand({
            Bucket: this.config_.bucket,
            Delete: {
              Objects: files.map((file) => ({ Key: file.fileKey })),
              Quiet: true,
            },
          })
        )
      } else {
        await this.client_.send(
          new DeleteObjectCommand({
            Bucket: this.config_.bucket,
            Key: files.fileKey,
          })
        )
      }
    } catch (e) {
      this.logger_.error(e as any)
    }
  }

  async getPresignedDownloadUrl(
    fileData: FileTypes.ProviderGetFileDTO
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config_.bucket,
      Key: `${fileData.fileKey}`,
    })
    // Cast to any to avoid SDK type incompatibilities across nested versions
    return await (getSignedUrl as any)(this.client_ as any, command as any, {
      expiresIn: this.config_.downloadFileDuration!,
    })
  }

  async getDownloadStream(
    file: FileTypes.ProviderGetFileDTO
  ): Promise<NodeJS.ReadableStream> {
    if (!file?.fileKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No fileKey provided`
      )
    }

    const response = await this.client_.send(
      new GetObjectCommand({
        Key: file.fileKey,
        Bucket: this.config_.bucket,
      })
    )

    return response.Body as NodeJS.ReadableStream
  }

  async getAsBuffer(file: FileTypes.ProviderGetFileDTO): Promise<Buffer> {
    if (!file?.fileKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `No fileKey provided`
      )
    }

    const response = await this.client_.send(
      new GetObjectCommand({
        Key: file.fileKey,
        Bucket: this.config_.bucket,
      })
    )

    // @ts-ignore - aws sdk provides transformToByteArray
    return Buffer.from(await response.Body.transformToByteArray())
  }
}

export default B2S3FileService
