import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Badge, Button, Container, FocusModal, Heading, Input, Label, Text, toast } from '@medusajs/ui';
import { useMemo, useState } from 'react';
import {
  useAdminCreateSocialGalleryImportMutation,
  useAdminRetrySocialGalleryImport,
  useAdminCreateSocialGalleryPostMutation,
  useAdminDeleteSocialGalleryPostMutation,
  useAdminListSocialGalleryImports,
  useAdminListSocialGalleryPosts,
  useAdminUpdateSocialGalleryPostMutation,
} from '../../hooks/social-gallery-posts';
import type {
  AdminCreateSocialGalleryPostDTO,
  AdminSocialImportJobDTO,
  AdminSocialGalleryPostDTO,
  SocialGalleryCategory,
  SocialGalleryMediaType,
} from '../../../sdk/admin/admin-social-gallery-posts';

type FormValues = AdminCreateSocialGalleryPostDTO;

const categories: { label: string; value: SocialGalleryCategory }[] = [
  { label: 'Dishes', value: 'dishes' },
  { label: 'Private Dinners', value: 'private_dinners' },
  { label: 'Events', value: 'events' },
  { label: 'Behind the Scenes', value: 'behind_the_scenes' },
  { label: 'Press / Collabs', value: 'press_collabs' },
];

const blankForm: FormValues = {
  title: '',
  caption: '',
  source_url: '',
  instagram_handle: '',
  provider: 'manual',
  provider_media_id: '',
  shortcode: '',
  permalink: '',
  import_status: 'draft',
  raw_provider_data: null,
  content_hash: '',
  posted_at: '',
  media_type: 'image',
  media_url: '',
  thumbnail_url: '',
  poster_url: '',
  alt_text: '',
  category: 'dishes',
  display_style: 'normal',
  linked_service_label: '',
  cta_label: 'Book this experience',
  cta_url: '/request',
  is_active: false,
  is_featured: false,
  sort_order: 0,
};

const normalize = (post?: AdminSocialGalleryPostDTO): FormValues => {
  if (!post) return blankForm;

  return {
    title: post.title,
    caption: post.caption ?? '',
    source_url: post.source_url ?? '',
    instagram_handle: post.instagram_handle ?? '',
    provider: post.provider,
    provider_media_id: post.provider_media_id ?? '',
    shortcode: post.shortcode ?? '',
    permalink: post.permalink ?? '',
    import_status: post.import_status,
    raw_provider_data: post.raw_provider_data ?? null,
    content_hash: post.content_hash ?? '',
    posted_at: post.posted_at ? post.posted_at.slice(0, 10) : '',
    media_type: post.media_type,
    media_url: post.media_url ?? '',
    thumbnail_url: post.thumbnail_url ?? '',
    poster_url: post.poster_url ?? '',
    alt_text: post.alt_text ?? '',
    category: post.category,
    display_style: post.display_style,
    linked_service_label: post.linked_service_label ?? '',
    cta_label: post.cta_label ?? 'Book this experience',
    cta_url: post.cta_url ?? '/request',
    is_active: post.is_active,
    is_featured: post.is_featured,
    sort_order: post.sort_order ?? 0,
  };
};

const sanitizePayload = (values: FormValues): AdminCreateSocialGalleryPostDTO => ({
  ...values,
  media_url: values.media_url || null,
  title: values.title || titleFromSocialUrl(values.source_url || '') || 'Social post',
  caption: values.caption || null,
  source_url: values.source_url || null,
  instagram_handle: values.instagram_handle || handleFromSocialUrl(values.source_url || '') || null,
  provider: values.provider || 'manual',
  provider_media_id: values.provider_media_id || null,
  shortcode: values.shortcode || null,
  permalink: values.permalink || values.source_url || null,
  import_status: values.import_status || (values.is_active ? 'published' : 'draft'),
  raw_provider_data: values.raw_provider_data || null,
  content_hash: values.content_hash || null,
  posted_at: values.posted_at || null,
  thumbnail_url: values.thumbnail_url || null,
  poster_url: values.poster_url || null,
  alt_text: values.alt_text || null,
  linked_service_label: values.linked_service_label || null,
  cta_label: values.cta_label || 'Book this experience',
  cta_url: values.cta_url || '/request',
  sort_order: Number(values.sort_order || 0),
});

const SocialGalleryPage = () => {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError } = useAdminListSocialGalleryPosts({ limit: 24, offset: page * 24 });
  const { data: importsData } = useAdminListSocialGalleryImports({ limit: 5 }, { refetchInterval: 3000 });
  const createImport = useAdminCreateSocialGalleryImportMutation();
  const deletePost = useAdminDeleteSocialGalleryPostMutation();
  const [editingPost, setEditingPost] = useState<AdminSocialGalleryPostDTO | null>(null);
  const [draftValues, setDraftValues] = useState<FormValues | null>(null);
  const [socialUrl, setSocialUrl] = useState('');

  const posts = useMemo(() => data?.social_gallery_posts ?? [], [data?.social_gallery_posts]);
  const importJobs = useMemo(() => importsData?.social_import_jobs ?? [], [importsData?.social_import_jobs]);
  const socialAccounts = useMemo(() => importsData?.social_accounts ?? [], [importsData?.social_accounts]);

  const handleImportStart = () => {
    const trimmedUrl = socialUrl.trim();
    if (!trimmedUrl) {
      toast.error('Paste an Instagram handle or profile link first');
      return;
    }

    createImport.mutate(
      {
        source: trimmedUrl,
        cta_label: 'Book this experience',
        cta_url: '/request',
      },
      {
        onSuccess: (result) => {
          if (result.social_import_job.status === 'completed') {
            toast.success('Instagram draft imported', {
              description: 'Review and publish it when it looks right.',
            });
          } else if (result.social_import_job.status === 'queued' || result.social_import_job.status === 'running') {
            toast.success('Instagram import queued', {
              description: 'The background importer will update this job when it finishes.',
            });
          } else {
            toast.success('Instagram profile saved', {
              description: result.social_import_job.message || 'Connect the Instagram importer to pull recent posts.',
            });
          }
          setSocialUrl('');
        },
        onError: () => {
          toast.error('Import could not start', {
            description: 'Check the Instagram handle or link and try again.',
          });
        },
      },
    );
  };

  const openManualDraft = () => {
    setDraftValues({
      ...blankForm,
      sort_order: posts.length,
    });
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Social Gallery</Heading>
          <Text className="text-ui-fg-subtle">
            Your favorite moments, ready for your website. Import, choose, and publish.
          </Text>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        {importsData && !importsData.configured && (
          <Text className="text-ui-fg-subtle">
            Instagram import is not connected yet. Ask your site administrator to connect Apify. Existing gallery
            content is unaffected.
          </Text>
        )}
        {isError && <Text className="text-ui-fg-error">Gallery posts could not be loaded. Refresh to try again.</Text>}
        <div className="rounded-xl border bg-ui-bg-base p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label>Import from Instagram</Label>
              <Input
                value={socialUrl}
                onChange={(event) => setSocialUrl(event.target.value)}
                placeholder="@chef_handle, profile URL, or post/reel URL"
              />
              <Text className="text-ui-fg-subtle text-xs">
                Import photos, reels, and carousels as drafts. Existing posts and your edits stay unchanged.
              </Text>
            </div>
            <Button onClick={handleImportStart} disabled={createImport.isPending || !importsData?.configured}>
              {createImport.isPending ? 'Starting...' : 'Import Instagram'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ui-fg-subtle">
          <span>{data?.count ?? 0} gallery posts</span>
          <span>
            {posts.filter((post) => post.is_active && post.import_status === 'published').length} published on this page
          </span>
          <span>{importsData?.account_count ?? socialAccounts.length} Instagram accounts</span>
          <span>Storefront: /gallery</span>
        </div>

        {importJobs.length > 0 && (
          <details
            className="rounded-xl border bg-ui-bg-base p-4"
            open={importJobs.some(
              (job) => job.status === 'queued' || job.status === 'running' || job.status === 'failed',
            )}
          >
            <summary className="cursor-pointer text-sm font-medium">Recent imports ({importJobs.length})</summary>
            <div className="mt-4 space-y-3">
              {importJobs.map((job) => (
                <ImportJobRow key={job.id} job={job} />
              ))}
            </div>
          </details>
        )}

        <div className="flex items-center justify-between">
          <div>
            <Text className="font-semibold">Gallery posts</Text>
            <Text className="text-ui-fg-subtle text-sm">
              Publish your favorites. Mark a Chef’s pick for a subtle spotlight in the gallery.
            </Text>
          </div>
          <Button variant="secondary" onClick={openManualDraft}>
            Add manually
          </Button>
        </div>

        {isLoading ? (
          <Text>Loading gallery posts...</Text>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Text className="font-medium">Start with an Instagram handle</Text>
            <Text className="text-ui-fg-subtle mt-1">
              Paste a profile above. Imported media will appear here as drafts for review.
            </Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={() => setEditingPost(post)}
                onDelete={() => {
                  if (!confirm(`Archive "${post.title}"? It will be hidden and future imports will leave it archived.`))
                    return;
                  deletePost.mutate(post.id, {
                    onSuccess: () => toast.success('Gallery post archived'),
                    onError: () => toast.error('Could not archive gallery post'),
                  });
                }}
              />
            ))}
          </div>
        )}
        {(data?.count || 0) > 24 && (
          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Text>
              Page {page + 1} of {Math.ceil((data?.count || 0) / 24)}
            </Text>
            <Button
              variant="secondary"
              disabled={(page + 1) * 24 >= (data?.count || 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {(draftValues || editingPost) && (
        <PostModal
          initialPost={editingPost ?? undefined}
          initialValues={draftValues ?? undefined}
          onClose={() => {
            setDraftValues(null);
            setEditingPost(null);
          }}
        />
      )}
    </Container>
  );
};

/*
 * The import-first screen above replaced the previous post-create-on-paste flow.
 * Keeping the curation modal below lets manual cleanup stay available without
 * making it the primary workflow.
 */
const ImportJobRow = ({ job }: { job: AdminSocialImportJobDTO }) => {
  const retry = useAdminRetrySocialGalleryImport();
  const canRetry = job.status === 'failed' && !!job.provider_run_id && job.failure_code !== 'provider_start_uncertain';
  const color =
    job.status === 'completed'
      ? 'green'
      : job.status === 'failed'
        ? 'red'
        : job.status === 'needs_connection'
          ? 'orange'
          : 'blue';

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-ui-bg-subtle p-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="font-medium">{job.handle ? `@${job.handle}` : 'Instagram post'}</Text>
          <Badge color={color as any}>{statusLabel(job.status)}</Badge>
        </div>
        <Text className="text-ui-fg-subtle mt-1 break-words text-sm">{job.message || job.source_url}</Text>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Text className="text-ui-fg-subtle text-sm">
          {job.imported_count} saved · {job.skipped_count || 0} unchanged
        </Text>
        {canRetry && (
          <Button
            size="small"
            variant="secondary"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(job.id, {
                onError: () => toast.error('Could not resume import. Check its status and try again.'),
              })
            }
          >
            Resume import
          </Button>
        )}
        {job.provider_run_id && (
          <a
            className="text-sm underline"
            href={`https://console.apify.com/actors/runs/${encodeURIComponent(job.provider_run_id)}`}
            target="_blank"
            rel="noreferrer"
          >
            Apify run details
          </a>
        )}
      </div>
    </div>
  );
};

const statusLabel = (status: AdminSocialImportJobDTO['status']) =>
  ({
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    needs_connection: 'Needs connector',
  })[status];

const PostCard = ({
  post,
  onEdit,
  onDelete,
}: {
  post: AdminSocialGalleryPostDTO;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const updatePost = useAdminUpdateSocialGalleryPostMutation(post.id);
  const previewUrl = post.thumbnail_url || post.poster_url || post.media_url;
  const isPublished = post.is_active && post.import_status === 'published';

  const quickUpdate = (data: Partial<AdminCreateSocialGalleryPostDTO>) => {
    updatePost.mutate(data, {
      onError: () => toast.error('Could not update gallery post'),
    });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-ui-bg-base">
      <button
        type="button"
        aria-label={`Edit ${post.title}`}
        className="block h-44 w-full shrink-0 bg-ui-bg-subtle text-left"
        onClick={onEdit}
      >
        {previewUrl ? (
          post.media_type === 'video' && !post.poster_url && !post.thumbnail_url && post.media_url ? (
            <video
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
              poster={post.poster_url || post.thumbnail_url || undefined}
            >
              <source src={post.media_url} />
            </video>
          ) : (
            <img className="h-full w-full object-cover" src={previewUrl} alt={post.alt_text || post.title} />
          )
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <Text className="text-ui-fg-subtle text-sm">Add media to preview this post</Text>
          </div>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <button type="button" className="line-clamp-2 text-left font-medium hover:underline" onClick={onEdit}>
              {post.title.replace(/[#@][^\s]+/g, '').trim() || categoryLabel(post.category)}
            </button>
            {post.media_type === 'video' && <Badge color="purple">Video</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Field label="Category">
            <select
              className="w-full rounded border bg-ui-bg-base px-3 py-2 text-sm"
              value={post.category}
              onChange={(event) => quickUpdate({ category: event.target.value as SocialGalleryCategory })}
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <QuickToggle
              label={isPublished ? 'Published' : 'Draft'}
              active={isPublished}
              onClick={() =>
                quickUpdate({
                  is_active: !isPublished,
                  import_status: isPublished ? 'draft' : 'published',
                })
              }
            />
            <QuickToggle
              label="Chef’s pick"
              active={post.is_featured}
              onClick={() => quickUpdate({ is_featured: !post.is_featured })}
            />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t pt-3">
          <Button size="small" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button size="small" variant="danger" onClick={onDelete}>
            Archive
          </Button>
        </div>
      </div>
    </div>
  );
};

const PostModal = ({
  initialPost,
  initialValues,
  onClose,
}: {
  initialPost?: AdminSocialGalleryPostDTO;
  initialValues?: FormValues;
  onClose: () => void;
}) => {
  const [values, setValues] = useState<FormValues>(() => initialValues ?? normalize(initialPost));
  const [previewIndex, setPreviewIndex] = useState(0);
  const previewAssets = initialPost?.media_assets || [];
  const previewAsset = previewAssets[previewIndex];
  const [advancedOpen, setAdvancedOpen] = useState(!initialPost);
  const createPost = useAdminCreateSocialGalleryPostMutation();
  const updatePost = useAdminUpdateSocialGalleryPostMutation(initialPost?.id ?? '');
  const isLoading = createPost.isPending || updatePost.isPending;

  const setValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === 'source_url') {
        next.instagram_handle = next.instagram_handle || handleFromSocialUrl(String(value));
        next.title = next.title || titleFromSocialUrl(String(value));
      }
      return next;
    });
  };

  const setPublished = (published: boolean) => {
    setValues((current) => ({
      ...current,
      is_active: published,
      import_status: published ? 'published' : 'draft',
    }));
  };

  const handleSubmit = async () => {
    const payload = sanitizePayload(values);

    if (!payload.source_url && !payload.media_url) {
      toast.error('Add a social link or media URL first');
      return;
    }

    try {
      if (initialPost) {
        await updatePost.mutateAsync(payload);
        toast.success('Gallery post updated');
      } else {
        await createPost.mutateAsync(payload);
        toast.success('Gallery post saved');
      }
      onClose();
    } catch (error) {
      console.error('Error saving gallery post:', error);
      toast.error('Save failed', {
        description: error instanceof Error ? error.message : 'Check required fields and try again.',
      });
    }
  };

  return (
    <FocusModal open onOpenChange={(open) => !open && onClose()}>
      <FocusModal.Content className="max-h-[90vh]">
        <FocusModal.Header>
          <FocusModal.Title>{initialPost ? 'Edit Social Post' : 'Add Gallery Post'}</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="max-h-[80vh] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="overflow-hidden rounded-xl border bg-ui-bg-subtle">
              <div className="flex h-80 items-center justify-center bg-ui-bg-base">
                {previewAsset?.url || values.media_url ? (
                  (previewAsset?.type || values.media_type) === 'video' ? (
                    <video
                      key={previewAsset?.url || values.media_url}
                      className="h-full w-full object-cover"
                      controls
                      poster={previewAsset?.poster_url || values.poster_url || values.thumbnail_url || undefined}
                    >
                      {values.media_url && <source src={previewAsset?.url || values.media_url} />}
                    </video>
                  ) : (
                    <img
                      className="h-full w-full object-cover"
                      src={previewAsset?.url || values.thumbnail_url || values.media_url || undefined}
                      alt={values.alt_text || values.title}
                    />
                  )
                ) : (
                  <div className="px-6 text-center">
                    <Text className="font-medium">Preview appears here</Text>
                    <Text className="text-ui-fg-subtle mt-1 text-sm">
                      Add a media URL below for a manual post. To import Instagram media, use the main import box.
                    </Text>
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                {previewAssets.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {previewAssets.map((asset, index) => (
                      <Button
                        key={asset.file_id || index}
                        size="small"
                        variant={index === previewIndex ? 'primary' : 'secondary'}
                        onClick={() => setPreviewIndex(index)}
                      >
                        Item {index + 1}
                      </Button>
                    ))}
                  </div>
                )}
                <Badge color={values.is_featured ? 'blue' : 'grey'}>
                  {values.is_featured ? 'Chef’s pick' : categoryLabel(values.category || 'dishes')}
                </Badge>
                <Text className="line-clamp-2 font-semibold">
                  {values.title.replace(/[#@][^\s]+/g, '').trim() || 'Gallery moment'}
                </Text>
                <Text className="text-ui-fg-subtle line-clamp-3 text-sm">
                  {values.caption ||
                    values.source_url ||
                    'Imported social content will be curated for the gallery page.'}
                </Text>
              </div>
            </div>

            <div className="space-y-6">
              <Section title="Quick Review">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Category">
                    <select
                      className="w-full rounded border bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base"
                      value={values.category}
                      onChange={(event) => setValue('category', event.target.value as SocialGalleryCategory)}
                    >
                      {categories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <QuickToggle
                    label={values.is_active && values.import_status === 'published' ? 'Published' : 'Draft'}
                    active={!!values.is_active && values.import_status === 'published'}
                    onClick={() => setPublished(!(values.is_active && values.import_status === 'published'))}
                  />
                  <QuickToggle
                    label="Chef’s pick"
                    active={!!values.is_featured}
                    onClick={() => setValue('is_featured', !values.is_featured)}
                  />
                </div>
              </Section>

              <Text className="text-ui-fg-subtle text-sm">
                The gallery arranges your photos automatically. Captions appear when a visitor opens a post.
              </Text>
              <Section title="Caption & title">
                <Field label="Title">
                  <Input
                    value={values.title}
                    onChange={(event) => setValue('title', event.target.value)}
                    placeholder="Tasting menu finale"
                  />
                </Field>
                <Field label="Caption">
                  <textarea
                    className="w-full rounded border bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base"
                    rows={4}
                    value={values.caption ?? ''}
                    onChange={(event) => setValue('caption', event.target.value)}
                    placeholder="Short story, dish note, or original caption"
                  />
                </Field>
              </Section>

              <Button type="button" variant="secondary" size="small" onClick={() => setAdvancedOpen((open) => !open)}>
                {advancedOpen ? 'Hide advanced details' : 'Advanced details'}
              </Button>

              {advancedOpen && (
                <>
                  <Section title="Source">
                    <Field label="Social Link">
                      <Input
                        value={values.source_url ?? ''}
                        onChange={(event) => setValue('source_url', event.target.value)}
                        placeholder="https://www.instagram.com/p/..."
                      />
                    </Field>
                    <Text className="text-ui-fg-subtle text-xs">
                      An optional source link credits the original post. Saving this form does not fetch or import the
                      link.
                    </Text>
                  </Section>

                  <Section title="Source details">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Instagram Handle">
                        <Input
                          value={values.instagram_handle ?? ''}
                          onChange={(event) => setValue('instagram_handle', event.target.value)}
                          placeholder="chef_handle"
                        />
                      </Field>
                      <Field label="Posted Date">
                        <Input
                          type="date"
                          value={values.posted_at ?? ''}
                          onChange={(event) => setValue('posted_at', event.target.value)}
                        />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Media and display">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Media Type">
                        <select
                          className="w-full rounded border bg-ui-bg-base px-3 py-2 text-sm text-ui-fg-base"
                          disabled={initialPost?.provider === 'instagram'}
                          value={values.media_type}
                          onChange={(event) => setValue('media_type', event.target.value as SocialGalleryMediaType)}
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          {initialPost?.media_type === 'carousel' && <option value="carousel">Carousel</option>}
                        </select>
                      </Field>
                      <Field label="Sort Order">
                        <Input
                          type="number"
                          value={values.sort_order ?? 0}
                          onChange={(event) => setValue('sort_order', Number(event.target.value))}
                        />
                      </Field>
                    </div>
                    <Field label="Media URL">
                      <Input
                        disabled={initialPost?.provider === 'instagram'}
                        value={values.media_url ?? ''}
                        onChange={(event) => setValue('media_url', event.target.value)}
                        placeholder="Image or video URL"
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Thumbnail URL">
                        <Input
                          disabled={initialPost?.provider === 'instagram'}
                          value={values.thumbnail_url ?? ''}
                          onChange={(event) => setValue('thumbnail_url', event.target.value)}
                          placeholder="Optional tile image"
                        />
                      </Field>
                      <Field label="Poster URL">
                        <Input
                          disabled={initialPost?.provider === 'instagram'}
                          value={values.poster_url ?? ''}
                          onChange={(event) => setValue('poster_url', event.target.value)}
                          placeholder="Optional video poster"
                        />
                      </Field>
                    </div>
                    <Field label="Alt Text">
                      <Input
                        value={values.alt_text ?? ''}
                        onChange={(event) => setValue('alt_text', event.target.value)}
                        placeholder="Describe the media for accessibility"
                      />
                    </Field>
                  </Section>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading || (!values.source_url && !values.media_url)}
                >
                  {isLoading ? 'Saving...' : initialPost ? 'Update Post' : 'Save Post'}
                </Button>
              </div>
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  );
};

const QuickToggle = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={active}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
      active
        ? 'border-ui-border-interactive bg-ui-bg-interactive text-ui-fg-on-color'
        : 'border-ui-border-base bg-ui-bg-base text-ui-fg-base'
    }`}
    onClick={onClick}
  >
    {label}
  </button>
);

const categoryLabel = (category: SocialGalleryCategory) =>
  categories.find((item) => item.value === category)?.label ?? category;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
    <Text className="font-semibold">{title}</Text>
    <div className="space-y-4">{children}</div>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    {children}
  </div>
);

const handleFromSocialUrl = (sourceUrl: string) => {
  try {
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (url.hostname.includes('instagram.com')) {
      if (pathParts[0] && !['p', 'reel', 'tv', 'stories'].includes(pathParts[0])) return pathParts[0].replace('@', '');
      return '';
    }

    if (url.hostname.includes('tiktok.com')) {
      const handle = pathParts.find((part) => part.startsWith('@'));
      return handle?.replace('@', '') ?? '';
    }
  } catch {
    return '';
  }

  return '';
};

const isProfileUrl = (sourceUrl: string) => {
  if (!sourceUrl) return false;

  try {
    const url = new URL(sourceUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (url.hostname.includes('instagram.com'))
      return !!pathParts[0] && !['p', 'reel', 'tv', 'stories'].includes(pathParts[0]);
    if (url.hostname.includes('tiktok.com'))
      return pathParts.some((part) => part.startsWith('@')) && !pathParts.includes('video');
  } catch {
    return false;
  }

  return false;
};

const titleFromSocialUrl = (sourceUrl: string) => {
  if (!sourceUrl) return '';
  const handle = handleFromSocialUrl(sourceUrl);
  if (isProfileUrl(sourceUrl) && handle) return `Social profile @${handle}`;
  if (sourceUrl.includes('instagram.com/reel')) return 'Instagram Reel';
  if (sourceUrl.includes('instagram.com')) return 'Instagram post';
  if (sourceUrl.includes('tiktok.com')) return 'TikTok post';
  return 'Social post';
};

export const config = defineRouteConfig({
  label: 'Social Gallery',
});

export const handle = {
  breadcrumb: () => 'Social Gallery',
};

export default SocialGalleryPage;
