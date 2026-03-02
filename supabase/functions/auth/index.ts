// @ts-nocheck
import { supabaseAdmin, json, getBearerToken } from '../_shared/supabase.ts';

type AuthAction = 'register' | 'login' | 'logout' | 'session';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { action, email, password } = (await req.json()) as {
      action: AuthAction;
      email?: string;
      password?: string;
    };

    switch (action) {
      case 'register': {
        if (!email || !password) return json({ error: 'email and password required' }, { status: 400 });

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error) return json({ error: error.message }, { status: 400 });
        return json({ user: data.user });
      }

      case 'login': {
        if (!email || !password) return json({ error: 'email and password required' }, { status: 400 });

        const anonClient = supabaseAdmin;
        const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
        if (error) return json({ error: error.message }, { status: 401 });

        return json({
          session: data.session,
          user: data.user,
          access_token: data.session?.access_token,
          refresh_token: data.session?.refresh_token,
        });
      }

      case 'session': {
        const token = getBearerToken(req);
        if (!token) return json({ error: 'missing bearer token' }, { status: 401 });

        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error) return json({ error: error.message }, { status: 401 });

        return json({ user: data.user });
      }

      case 'logout': {
        const token = getBearerToken(req);
        if (!token) return json({ ok: true });

        const { error } = await supabaseAdmin.auth.admin.signOut(token);
        if (error) return json({ error: error.message }, { status: 400 });

        return json({ ok: true });
      }

      default:
        return json({ error: 'invalid action' }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return json({ error: message }, { status: 500 });
  }
});
