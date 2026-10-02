import { defineRouteConfig } from '@medusajs/admin-sdk';
import { Badge, Button, Container, FocusModal, Heading, Input, Label, Text, toast } from '@medusajs/ui';
import { useMemo, useState } from 'react';
import {
  useAdminCreateSocialGalleryPostMutation,
  useAdminDeleteSocialGalleryPostMutation,
  useAdminListSocialGalleryPosts,
  useAdminUpdateSocialGalleryPostMutation,
} from '../../hooks/social-gallery-posts';
import type {
  AdminCreateSocialGalleryPostDTO,
  AdminSocialGalleryPostDTO,
  SocialGalleryCategory,
  SocialGalleryDisplayStyle,
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

const displayStyles: { label: string; value: SocialGalleryDisplayStyle }[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'Large', value: 'large' },
  { label: 'Wide', value: 'wide' },
  { label: 'Feature', value: 'feature' },
];

const blankForm: FormValues = {
  title: '',
  caption: '',
  source_url: '',
  instagram_handle: '',
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
  is_active: true,
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
    posted_at: post.posted_at ? post.posted_at.slice(0, 10) : '',
    media_type: post.media_type,
    media_url: post.media_url,
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
  title: values.title || titleFromSocialUrl(values.source_url || '') || 'Social post',
  caption: values.caption || null,
  source_url: values.source_url || null,
  instagram_handle: values.instagram_handle || handleFromSocialUrl(values.source_url || '') || null,
  posted_at: values.posted_at || null,
  thumbnail_url: values.thumbnail_url || null,
  poster_url: values.poster_url || null,
  alt_text: values.alt_text || null,
  linked_service_label: values.linked_service_label || null,
  cta_label: values.cta_label || 'Book this experience',
  cta_url: values.cta_url || '/request',
  sort_order: Number(values.sort_order || 0),
});

const draftFromSocialUrl = (sourceUrl: string, sortOrder: number): FormValues => {
  const handle = handleFromSocialUrl(sourceUrl);
  const title = titleFromSocialUrl(sourceUrl);

  return {
    ...blankForm,
    title,
    source_url: sourceUrl,
    instagram_handle: handle,
    media_url: '',
    thumbnail_url: '',
    poster_url: '',
    alt_text: title,
    sort_order: sortOrder,
  };
};

const SocialGalleryPage = () => {
  const { data, isLoading } = useAdminListSocialGalleryPosts();
  const deletePost = useAdminDeleteSocialGalleryPostMutation();
  const [editingPost, setEditingPost] = useState<AdminSocialGalleryPostDTO | null>(null);
  const [draftValues, setDraftValues] = useState<FormValues | null>(null);
  const [socialUrl, setSocialUrl] = useState('');

  const posts = useMemo(() => data?.social_gallery_posts ?? [], [data?.social_gallery_posts]);

  const handleImportStart = () => {
    const trimmedUrl = socialUrl.trim();
    if (!trimmedUrl) {
      toast.error('Paste a social link first');
      return;
    }

    setDraftValues(draftFromSocialUrl(trimmedUrl, posts.length));
    setSocialUrl('');
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Social Gallery</Heading>
          <Text className="text-ui-fg-subtle">
            Paste social content, curate the best moments, and publish them to the storefront gallery.
          </Text>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="rounded-xl border bg-ui-bg-base p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label>Import from social</Label>
              <Input
                value={socialUrl}
                onChange={(event) => setSocialUrl(event.target.value)}
                placeholder="Paste an Instagram, Reel, TikTok, or post link"
              />
              <Text className="text-ui-fg-subtle text-xs">
                MVP import creates a ready-to-curate draft from the link. Add a media URL only when the preview cannot be fetched.
              </Text>
            </div>
            <Button onClick={handleImportStart}>Import</Button>
          </div>
        </div>

        <div className="rounded-xl border bg-ui-bg-subtle p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SettingPreview label="Gallery Page" value="/gallery" />
            <SettingPreview label="Default CTA" value="Book this experience" />
            <SettingPreview label="Published Posts" value={`${posts.filter((post) => post.is_active).length} visible`} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Text className="font-semibold">Gallery posts</Text>
            <Text className="text-ui-fg-subtle text-sm">Use quick controls here. Open a post only when you need details.</Text>
          </div>
          <Button variant="secondary" onClick={() => setDraftValues({ ...blankForm, sort_order: posts.length })}>
            Add manually
          </Button>
        </div>

        {isLoading ? (
          <Text>Loading gallery posts...</Text>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Text className="font-medium">Start with a social link</Text>
            <Text className="text-ui-fg-subtle mt-1">Paste a post or profile above. The detailed editor is only there for cleanup.</Text>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={() => setEditingPost(post)}
                onDelete={() => {
                  if (!confirm(`Delete "${post.title}"?`)) return;
                  deletePost.mutate(post.id, {
                    onSuccess: () => toast.success('Gallery post deleted'),
                    onError: () => toast.error('Could not delete gallery post'),
                  });
                }}
              />
            ))}
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

  const quickUpdate = (data: Partial<AdminCreateSocialGalleryPostDTO>) => {
    updatePost.mutate(data, {
      onError: () => toast.error('Could not update gallery post'),
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-ui-bg-base">
      <button type="button" className="block h-48 w-full bg-ui-bg-subtle text-left" onClick={onEdit}>
        {previewUrl ? (
          post.media_type === 'video' ? (
            <video className="h-full w-full object-cover" muted playsInline preload="metadata" poster={post.poster_url || post.thumbnail_url || undefined}>
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

      <div className="space-y-4 p-4">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <button type="button" className="text-left font-medium hover:underline" onClick={onEdit}>
              {post.title}
            </button>
            {post.media_type === 'video' && <Badge color="purple">Video</Badge>}
          </div>
          <Text className="text-ui-fg-subtle line-clamp-2 text-sm">{post.caption || post.source_url || 'Imported social post'}</Text>
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
            <QuickToggle label="Visible" active={post.is_active} onClick={() => quickUpdate({ is_active: !post.is_active })} />
            <QuickToggle label="Featured" active={post.is_featured} onClick={() => quickUpdate({ is_featured: !post.is_featured })} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <Button size="small" variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button size="small" variant="danger" onClick={onDelete}>
            Delete
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
  const [advancedOpen, setAdvancedOpen] = useState(!!initialPost);
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
        toast.success('Social post imported');
      }
      onClose();
    } catch (error) {
      console.error('Error saving gallery post:', error);
      toast.error('Save failed', {
        description: 'Check required fields and try again.',
      });
    }
  };

  return (
    <FocusModal open onOpenChange={(open) => !open && onClose()}>
      <FocusModal.Content className="max-h-[90vh]">
        <FocusModal.Header>
          <FocusModal.Title>{initialPost ? 'Edit Social Post' : 'Import Social Post'}</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="max-h-[80vh] overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="overflow-hidden rounded-xl border bg-ui-bg-subtle">
              <div className="flex h-80 items-center justify-center bg-ui-bg-base">
                {values.media_url ? (
                  values.media_type === 'video' ? (
                    <video className="h-full w-full object-cover" controls poster={values.poster_url || values.thumbnail_url || undefined}>
                      <source src={values.media_url} />
                    </video>
                  ) : (
                    <img className="h-full w-full object-cover" src={values.thumbnail_url || values.media_url} alt={values.alt_text || values.title} />
                  )
                ) : (
                  <div className="px-6 text-center">
                    <Text className="font-medium">Preview appears here</Text>
                    <Text className="text-ui-fg-subtle mt-1 text-sm">
                      Paste a social link first. Add a media URL only if the importer cannot fetch one yet.
                    </Text>
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <Badge color={values.is_featured ? 'blue' : 'grey'}>{values.is_featured ? 'Featured' : categoryLabel(values.category || 'dishes')}</Badge>
                <Text className="font-semibold">{values.title || titleFromSocialUrl(values.source_url || '') || 'Social post'}</Text>
                <Text className="text-ui-fg-subtle line-clamp-3 text-sm">
                  {values.caption || values.source_url || 'Imported social content will be curated for the gallery page.'}
                </Text>
              </div>
            </div>

            <div className="space-y-6">
              <Section title="Import">
                <Field label="Social Link">
                  <Input
                    value={values.source_url ?? ''}
                    onChange={(event) => setValue('source_url', event.target.value)}
                    placeholder="https://www.instagram.com/p/..."
                  />
                </Field>
                <Text className="text-ui-fg-subtle text-xs">
                  This is the chef-friendly path. Advanced fields below are for cleanup, overrides, or failed imports.
                </Text>
              </Section>

              <Section title="Quick Review">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Category">
                    <select
                      className="w-full rounded border px-3 py-2 text-sm"
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
                  <Field label="CTA">
                    <Input value={values.cta_label ?? ''} onChange={(event) => setValue('cta_label', event.target.value)} placeholder="Book this experience" />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <QuickToggle label="Show on gallery" active={!!values.is_active} onClick={() => setValue('is_active', !values.is_active)} />
                  <QuickToggle label="Feature this post" active={!!values.is_featured} onClick={() => setValue('is_featured', !values.is_featured)} />
                </div>
              </Section>

              <button
                type="button"
                className="text-ui-fg-base text-sm font-semibold hover:underline"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                {advancedOpen ? 'Hide advanced details' : 'Advanced details'}
              </button>

              {advancedOpen && (
                <>
                  <Section title="Content Overrides">
                    <Field label="Title">
                      <Input value={values.title} onChange={(event) => setValue('title', event.target.value)} placeholder="Tasting menu finale" />
                    </Field>
                    <Field label="Caption">
                      <textarea
                        className="w-full rounded border px-3 py-2 text-sm"
                        rows={4}
                        value={values.caption ?? ''}
                        onChange={(event) => setValue('caption', event.target.value)}
                        placeholder="Short story, dish note, or original caption"
                      />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Instagram Handle">
                        <Input value={values.instagram_handle ?? ''} onChange={(event) => setValue('instagram_handle', event.target.value)} placeholder="chef_handle" />
                      </Field>
                      <Field label="Posted Date">
                        <Input type="date" value={values.posted_at ?? ''} onChange={(event) => setValue('posted_at', event.target.value)} />
                      </Field>
                    </div>
                  </Section>

                  <Section title="Media Fallback">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Field label="Media Type">
                        <select
                          className="w-full rounded border px-3 py-2 text-sm"
                          value={values.media_type}
                          onChange={(event) => setValue('media_type', event.target.value as SocialGalleryMediaType)}
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="carousel">Carousel</option>
                        </select>
                      </Field>
                      <Field label="Display Style">
                        <select
                          className="w-full rounded border px-3 py-2 text-sm"
                          value={values.display_style}
                          onChange={(event) => setValue('display_style', event.target.value as SocialGalleryDisplayStyle)}
                        >
                          {displayStyles.map((style) => (
                            <option key={style.value} value={style.value}>
                              {style.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Sort Order">
                        <Input type="number" value={values.sort_order ?? 0} onChange={(event) => setValue('sort_order', Number(event.target.value))} />
                      </Field>
                    </div>
                    <Field label="Media URL">
                      <Input value={values.media_url} onChange={(event) => setValue('media_url', event.target.value)} placeholder="Image or video URL" />
                    </Field>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Thumbnail URL">
                        <Input value={values.thumbnail_url ?? ''} onChange={(event) => setValue('thumbnail_url', event.target.value)} placeholder="Optional tile image" />
                      </Field>
                      <Field label="Poster URL">
                        <Input value={values.poster_url ?? ''} onChange={(event) => setValue('poster_url', event.target.value)} placeholder="Optional video poster" />
                      </Field>
                    </div>
                    <Field label="Alt Text">
                      <Input value={values.alt_text ?? ''} onChange={(event) => setValue('alt_text', event.target.value)} placeholder="Describe the media for accessibility" />
                    </Field>
                  </Section>

                  <Section title="Conversion">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label="Linked Service Label">
                        <Input
                          value={values.linked_service_label ?? ''}
                          onChange={(event) => setValue('linked_service_label', event.target.value)}
                          placeholder="Private dinner"
                        />
                      </Field>
                      <Field label="CTA URL">
                        <Input value={values.cta_url ?? ''} onChange={(event) => setValue('cta_url', event.target.value)} placeholder="/request" />
                      </Field>
                    </div>
                  </Section>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isLoading || (!values.source_url && !values.media_url)}>
                  {isLoading ? 'Saving...' : initialPost ? 'Update Post' : 'Import Post'}
                </Button>
              </div>
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  );
};

const SettingPreview = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border bg-ui-bg-base p-4">
    <Text className="text-ui-fg-subtle text-xs uppercase">{label}</Text>
    <Text className="mt-1 font-medium">{value}</Text>
  </div>
);

const QuickToggle = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
      active ? 'border-ui-border-interactive bg-ui-bg-interactive text-ui-fg-on-color' : 'border-ui-border-base bg-ui-bg-base text-ui-fg-base'
    }`}
    onClick={onClick}
  >
    {label}
  </button>
);

const categoryLabel = (category: SocialGalleryCategory) => categories.find((item) => item.value === category)?.label ?? category;

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

const titleFromSocialUrl = (sourceUrl: string) => {
  if (!sourceUrl) return '';
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
