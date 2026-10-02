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
  caption: values.caption || null,
  source_url: values.source_url || null,
  instagram_handle: values.instagram_handle || null,
  posted_at: values.posted_at || null,
  thumbnail_url: values.thumbnail_url || null,
  poster_url: values.poster_url || null,
  alt_text: values.alt_text || null,
  linked_service_label: values.linked_service_label || null,
  cta_label: values.cta_label || null,
  cta_url: values.cta_url || null,
  sort_order: Number(values.sort_order || 0),
});

const SocialGalleryPage = () => {
  const { data, isLoading } = useAdminListSocialGalleryPosts();
  const createPost = useAdminCreateSocialGalleryPostMutation();
  const deletePost = useAdminDeleteSocialGalleryPostMutation();
  const [editingPost, setEditingPost] = useState<AdminSocialGalleryPostDTO | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const posts = useMemo(() => data?.social_gallery_posts ?? [], [data?.social_gallery_posts]);

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Social Gallery</Heading>
          <Text className="text-ui-fg-subtle">
            Curate Instagram-style image and video posts for the storefront gallery page.
          </Text>
        </div>
        <Button onClick={() => setIsCreating(true)}>Create Post</Button>
      </div>

      <div className="px-6 py-4">
        {isLoading ? (
          <Text>Loading gallery posts...</Text>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Text className="font-medium">No gallery posts yet</Text>
            <Text className="text-ui-fg-subtle mt-1">Add a post with an image or video URL to populate /gallery.</Text>
            <Button className="mt-4" onClick={() => setIsCreating(true)}>
              Create the first post
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-left text-sm">
              <thead className="bg-ui-bg-subtle text-ui-fg-subtle">
                <tr>
                  <th className="px-4 py-3">Post</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Display</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="text-ui-fg-base text-left font-medium hover:underline"
                        onClick={() => setEditingPost(post)}
                      >
                        {post.title}
                      </button>
                      {post.instagram_handle && <Text className="text-ui-fg-subtle text-xs">@{post.instagram_handle}</Text>}
                    </td>
                    <td className="px-4 py-3 capitalize">{post.media_type}</td>
                    <td className="px-4 py-3">{categoryLabel(post.category)}</td>
                    <td className="px-4 py-3 capitalize">{post.display_style}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Badge color={post.is_active ? 'green' : 'red'}>
                          {post.is_active ? 'Active' : 'Hidden'}
                        </Badge>
                        {post.is_featured && <Badge color="blue">Featured</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="small" variant="secondary" onClick={() => setEditingPost(post)}>
                        Edit
                      </Button>
                      <Button
                        className="ml-2"
                        size="small"
                        variant="danger"
                        onClick={() => {
                          if (!confirm(`Delete "${post.title}"?`)) return;
                          deletePost.mutate(post.id, {
                            onSuccess: () => toast.success('Gallery post deleted'),
                            onError: () => toast.error('Could not delete gallery post'),
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(isCreating || editingPost) && (
        <PostModal
          initialPost={editingPost ?? undefined}
          isLoading={createPost.isPending}
          onClose={() => {
            setIsCreating(false);
            setEditingPost(null);
          }}
        />
      )}
    </Container>
  );
};

const PostModal = ({
  initialPost,
  onClose,
}: {
  initialPost?: AdminSocialGalleryPostDTO;
  isLoading?: boolean;
  onClose: () => void;
}) => {
  const [values, setValues] = useState<FormValues>(() => normalize(initialPost));
  const createPost = useAdminCreateSocialGalleryPostMutation();
  const updatePost = useAdminUpdateSocialGalleryPostMutation(initialPost?.id ?? '');
  const isLoading = createPost.isPending || updatePost.isPending;

  const setValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    const payload = sanitizePayload(values);

    try {
      if (initialPost) {
        await updatePost.mutateAsync(payload);
        toast.success('Gallery post updated');
      } else {
        await createPost.mutateAsync(payload);
        toast.success('Gallery post created');
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
          <FocusModal.Title>{initialPost ? 'Edit Gallery Post' : 'Create Gallery Post'}</FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="max-h-[80vh] overflow-y-auto p-6">
          <div className="space-y-6">
            <Section title="Content">
              <Field label="Title">
                <Input value={values.title} onChange={(e) => setValue('title', e.target.value)} placeholder="Tasting menu finale" />
              </Field>
              <Field label="Caption">
                <textarea
                  className="w-full rounded border px-3 py-2 text-sm"
                  rows={4}
                  value={values.caption ?? ''}
                  onChange={(e) => setValue('caption', e.target.value)}
                  placeholder="Short story, dish note, or original caption"
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Instagram Handle">
                  <Input value={values.instagram_handle ?? ''} onChange={(e) => setValue('instagram_handle', e.target.value)} placeholder="chef_handle" />
                </Field>
                <Field label="Posted Date">
                  <Input type="date" value={values.posted_at ?? ''} onChange={(e) => setValue('posted_at', e.target.value)} />
                </Field>
              </div>
              <Field label="Source URL">
                <Input value={values.source_url ?? ''} onChange={(e) => setValue('source_url', e.target.value)} placeholder="https://instagram.com/p/..." />
              </Field>
            </Section>

            <Section title="Media">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Media Type">
                  <select
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={values.media_type}
                    onChange={(e) => setValue('media_type', e.target.value as SocialGalleryMediaType)}
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="carousel">Carousel</option>
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={values.category}
                    onChange={(e) => setValue('category', e.target.value as SocialGalleryCategory)}
                  >
                    {categories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Display Style">
                  <select
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={values.display_style}
                    onChange={(e) => setValue('display_style', e.target.value as SocialGalleryDisplayStyle)}
                  >
                    {displayStyles.map((style) => (
                      <option key={style.value} value={style.value}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Media URL">
                <Input value={values.media_url} onChange={(e) => setValue('media_url', e.target.value)} placeholder="Image or video URL" />
              </Field>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Thumbnail URL">
                  <Input value={values.thumbnail_url ?? ''} onChange={(e) => setValue('thumbnail_url', e.target.value)} placeholder="Optional tile image" />
                </Field>
                <Field label="Poster URL">
                  <Input value={values.poster_url ?? ''} onChange={(e) => setValue('poster_url', e.target.value)} placeholder="Optional video poster" />
                </Field>
              </div>
              <Field label="Alt Text">
                <Input value={values.alt_text ?? ''} onChange={(e) => setValue('alt_text', e.target.value)} placeholder="Describe the media for accessibility" />
              </Field>
            </Section>

            <Section title="Conversion">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Linked Service Label">
                  <Input value={values.linked_service_label ?? ''} onChange={(e) => setValue('linked_service_label', e.target.value)} placeholder="Private dinner" />
                </Field>
                <Field label="CTA Label">
                  <Input value={values.cta_label ?? ''} onChange={(e) => setValue('cta_label', e.target.value)} placeholder="Book this experience" />
                </Field>
                <Field label="CTA URL">
                  <Input value={values.cta_url ?? ''} onChange={(e) => setValue('cta_url', e.target.value)} placeholder="/request" />
                </Field>
              </div>
            </Section>

            <Section title="Publishing">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <CheckboxField label="Active" checked={!!values.is_active} onChange={(checked) => setValue('is_active', checked)} />
                <CheckboxField label="Featured" checked={!!values.is_featured} onChange={(checked) => setValue('is_featured', checked)} />
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={values.sort_order ?? 0}
                    onChange={(e) => setValue('sort_order', Number(e.target.value))}
                  />
                </Field>
              </div>
            </Section>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={isLoading || !values.title || !values.media_url}>
                {isLoading ? 'Saving...' : initialPost ? 'Update Post' : 'Create Post'}
              </Button>
            </div>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  );
};

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

const CheckboxField = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex items-center gap-3 rounded-md border bg-ui-bg-base px-3 py-2">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <Text className="font-medium">{label}</Text>
  </label>
);

export const config = defineRouteConfig({
  label: 'Social Gallery',
});

export const handle = {
  breadcrumb: () => 'Social Gallery',
};

export default SocialGalleryPage;
