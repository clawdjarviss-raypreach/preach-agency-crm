// @ts-nocheck
import { supabaseAdmin, supabaseAnon, json, getBearerToken } from '../_shared/supabase.ts';

type AuthAction = 'register' | 'login' | 'logout' | 'session';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { action, email, password, chatterId, username } = (await req.json()) as {
      action: AuthAction;
      email?: string;
      password?: string;
      chatterId?: string;
      username?: string;
    };

    switch (action) {
      case 'register': {
        if (!email || !password) {
          return json({ error: 'email and password required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error) return json({ error: error.message }, { status: 400 });

        // Link Supabase Auth user to CRM chatter row for RLS (auth.uid() -> crm_chatters.supabase_auth_id)
        if (data.user?.id) {
          if (chatterId) {
            const { error: linkError } = await supabaseAdmin
              .from('crm_chatters')
              .update({ supabase_auth_id: data.user.id, email })
              .eq('id', chatterId);
            if (linkError) return json({ error: linkError.message }, { status: 400 });
          } else if (username) {
            const { error: linkError } = await supabaseAdmin
              .from('crm_chatters')
              .update({ supabase_auth_id: data.user.id, email })
              .eq('username', username);
            if (linkError) return json({ error: linkError.message }, { status: 400 });
          }
        }

        return json({ user: data.user });
      }

      case 'login': {
        if (!email || !password) {
          return json({ error: 'email and password required' }, { status: 400 });
        }

        if (!supabaseAnon) {
          return json({ error: 'SUPABASE_ANON_KEY not configured' }, { status: 500 });
        }

        const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
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

        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !userData.user?.id) {
          return json({ ok: true });
        }

        const { error } = await supabaseAdmin.auth.admin.signOut(userData.user.id);
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
