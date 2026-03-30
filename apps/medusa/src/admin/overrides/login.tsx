import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Heading, Hint, Input, Text } from '@medusajs/ui';
import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { useForm, type ControllerRenderProps } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as z from 'zod';
import loginBrandMarkUrl from '../../assets/chefhat.jpg';
import { Form } from '~dashboard/components/common/form';
import { useSignInWithEmailPass } from '~dashboard/hooks/api';
import { isFetchError } from '~dashboard/lib/is-fetch-error';
import { useExtension } from '~dashboard/providers/extension-provider';

const DOC_TITLE = 'Private Chef Admin';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

type LoginFormValues = z.infer<typeof LoginSchema>;

export const Login = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { getWidgets } = useExtension();

  const from = location.state?.from?.pathname || '/chef-events';

  useEffect(() => {
    const previousTitle = document.title;
    document.title = DOC_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { mutateAsync, isPending } = useSignInWithEmailPass();

  const handleSubmit = form.handleSubmit(async ({ email, password }) => {
    await mutateAsync(
      {
        email,
        password,
      },
      {
        onError: (error: unknown) => {
          if (isFetchError(error)) {
            if (error.status === 401) {
              form.setError('email', {
                type: 'manual',
                message: error.message,
              });

              return;
            }
          }

          const message = error instanceof Error ? error.message : 'An error occurred';

          form.setError('root.serverError', {
            type: 'manual',
            message,
          });
        },
        onSuccess: () => {
          navigate(from, { replace: true });
        },
      },
    );
  });

  const serverError = form.formState.errors?.root?.serverError?.message;
  const validationError = form.formState.errors.email?.message || form.formState.errors.password?.message;

  return (
    <div className="bg-ui-bg-subtle flex min-h-dvh w-dvw items-center justify-center">
      <div className="m-4 flex w-full max-w-[280px] flex-col items-center">
        <img
          src={loginBrandMarkUrl}
          alt="Private Chef"
          className="shadow-elevation-card-rest mb-4 h-[50px] w-[50px] shrink-0 rounded-xl object-cover"
        />
        <div className="mb-4 flex flex-col items-center">
          <Heading>Private Chef&apos;s Admin</Heading>
          <Text size="small" className="text-ui-fg-subtle text-center">
            Sign in to manage your events.
          </Text>
        </div>
        <div className="flex w-full flex-col gap-y-3">
          {getWidgets('login.before').map((Component: ComponentType, i: number) => {
            return <Component key={i} />;
          })}
          <Form {...form}>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-y-6">
              <div className="flex flex-col gap-y-1">
                <Form.Field
                  control={form.control}
                  name="email"
                  render={({
                    field,
                  }: {
                    field: ControllerRenderProps<LoginFormValues, 'email'>;
                  }) => {
                    return (
                      <Form.Item>
                        <Form.Control>
                          <Input
                            autoComplete="email"
                            {...field}
                            className="bg-ui-bg-field-component"
                            placeholder={t('fields.email')}
                          />
                        </Form.Control>
                      </Form.Item>
                    );
                  }}
                />
                <Form.Field
                  control={form.control}
                  name="password"
                  render={({
                    field,
                  }: {
                    field: ControllerRenderProps<LoginFormValues, 'password'>;
                  }) => {
                    return (
                      <Form.Item>
                        <Form.Label>{}</Form.Label>
                        <Form.Control>
                          <Input
                            type="password"
                            autoComplete="current-password"
                            {...field}
                            className="bg-ui-bg-field-component"
                            placeholder={t('fields.password')}
                          />
                        </Form.Control>
                      </Form.Item>
                    );
                  }}
                />
              </div>
              {validationError && (
                <div className="text-center">
                  <Hint className="inline-flex" variant={'error'}>
                    {validationError}
                  </Hint>
                </div>
              )}
              {serverError && (
                <Alert className="bg-ui-bg-base items-center p-2" dismissible variant="error">
                  {serverError}
                </Alert>
              )}
              <Button className="w-full" type="submit" isLoading={isPending}>
                {t('actions.continueWithEmail')}
              </Button>
            </form>
          </Form>
          {getWidgets('login.after').map((Component: ComponentType, i: number) => {
            return <Component key={i} />;
          })}
        </div>
        <span className="text-ui-fg-muted txt-small my-6">
          <Trans
            i18nKey="login.forgotPassword"
            components={[
              <Link
                key="reset-password-link"
                to="/reset-password"
                className="text-ui-fg-interactive transition-fg hover:text-ui-fg-interactive-hover focus-visible:text-ui-fg-interactive-hover font-medium outline-none"
              />,
            ]}
          />
        </span>
      </div>
    </div>
  );
};

export { Login as Component };
export default Login;
