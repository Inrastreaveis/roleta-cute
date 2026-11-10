(() => {
  const sb = window.roletaSupabase;
  const bucket = 'roleta-assets';
  const defaults = {
    site_title: 'Roleta Cute', site_subtitle: 'Entre na roleta e boa sorte! ✨',
    theme: 'pink', background_type: 'gradient', background_value: '',
    music_file: '', music_title: '', music_enabled: false, allow_join: true
  };
  const fail = error => { if (error) throw new Error(error.message || 'Não foi possível concluir a operação.'); };
  const bodyOf = options => {
    if (!options?.body) return {};
    if (options.body instanceof FormData) return options.body;
    if (typeof options.body === 'string') { try { return JSON.parse(options.body); } catch { return {}; } }
    return options.body;
  };
  const ext = name => (String(name || '').match(/\.[a-z0-9]{2,5}$/i) || [''])[0].toLowerCase();
  const cleanFile = name => String(name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-70);

  async function getSignedProfile() {
    const { data: { user }, error: userError } = await sb.auth.getUser();
    fail(userError);
    if (!user) return null;
    const { data, error } = await sb.from('profiles')
      .select('id,email,username,role,can_draw,created_at')
      .eq('id', user.id).maybeSingle();
    fail(error);
    if (!data) return null;
    return { ...data, username: data.username || String(data.email || '').split('@')[0] || 'Conta' };
  }

  async function currentProfile() {
    const profile = await getSignedProfile();
    if (!profile) throw new Error('Faça login para continuar.');
    if (!['owner','admin','moderator'].includes(profile.role)) {
      throw new Error('Sua conta ainda não foi autorizada pelo proprietário.');
    }
    return profile;
  }

  async function publicSettings() {
    const { data, error } = await sb.from('site_settings').select('key,value');
    fail(error);
    return { ...defaults, ...(data || []).reduce((out, row) => (out[row.key] = row.value, out), {}) };
  }

  async function getPublicState() {
    const [people, links, settings, winners, profile] = await Promise.all([
      sb.from('participants').select('id,name,created_at').order('created_at', { ascending: true }),
      sb.from('links').select('id,label,url,icon,icon_type,icon_image_url,color,sort_order').eq('enabled', true).order('sort_order', { ascending: true }),
      publicSettings(),
      sb.rpc('public_current_winners'),
      getSignedProfile()
    ]);
    fail(people.error); fail(links.error); fail(winners.error);
    const activeRole = profile && ['owner','admin','moderator'].includes(profile.role);
    const canDraw = Boolean(activeRole && (profile.role === 'owner' || profile.can_draw === true));
    return {
      participants: people.data || [], links: links.data || [], settings,
      currentWinners: Array.isArray(winners.data) ? winners.data : [],
      drawAccess: { authorized: canDraw, username: canDraw ? profile.username : null }
    };
  }

  async function updateSettings(values) {
    const rows = Object.entries(values).map(([key, value]) => ({ key, value }));
    if (!rows.length) return;
    const { error } = await sb.from('site_settings').upsert(rows, { onConflict: 'key' });
    fail(error);
  }

  async function uploadFile(form, folder) {
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Escolha um arquivo primeiro.');
    const isMusic = folder === 'music';
    const max = isMusic ? 30 * 1024 * 1024 : (folder === 'link-icons' ? 3 * 1024 * 1024 : 12 * 1024 * 1024);
    if (file.size > max) throw new Error(`O arquivo ultrapassa o limite de ${isMusic ? '30 MB' : folder === 'link-icons' ? '3 MB' : '12 MB'}.`);
    const allowed = isMusic ? ['.mp3','.ogg','.wav','.m4a'] : ['.jpg','.jpeg','.png','.webp'];
    if (!allowed.includes(ext(file.name))) throw new Error('Formato de arquivo não permitido.');
    const path = `${folder}/${crypto.randomUUID()}-${cleanFile(file.name)}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type || undefined
    });
    fail(error);
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    if (folder === 'music') await updateSettings({ music_file: data.publicUrl, music_title: file.name });
    return { path: data.publicUrl };
  }

  async function adminState() {
    const profile = await currentProfile();
    const [settings, people, links, history, users] = await Promise.all([
      publicSettings(),
      sb.from('participants').select('id,name,created_at').order('created_at', { ascending: true }),
      sb.from('links').select('id,label,url,icon,icon_type,icon_image_url,color,sort_order,enabled').order('sort_order', { ascending: true }),
      sb.from('draws').select('id,batch_id,participant_id,winner_name,is_current,replaced_by,created_at').order('created_at', { ascending: false }).limit(100),
      profile.role === 'owner'
        ? sb.from('profiles').select('id,email,username,role,can_draw,created_at').order('created_at', { ascending: true })
        : Promise.resolve({ data: [], error: null })
    ]);
    fail(people.error); fail(links.error); fail(history.error); fail(users.error);
    return {
      user: profile, settings, participants: people.data || [], links: links.data || [], history: history.data || [],
      users: (users.data || []).map(u => ({ ...u, username: u.username || String(u.email || '').split('@')[0] || 'Conta' }))
    };
  }

  window.roletaSupabaseApi = {
    getPublicState, publicSettings, currentProfile,
    async getDeviceStatus(deviceHash) {
      const { data, error } = await sb.rpc('device_registration_status', { p_device_hash: deviceHash });
      fail(error); return data;
    },
    async registerParticipant(name, deviceHash) {
      const { data, error } = await sb.rpc('register_participant', { p_name: name, p_device_hash: deviceHash });
      fail(error); return data;
    }
  };

  window.roletaApi = async (url, options = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const body = bodyOf(options);
    if (url === '/api/admin/state' && method === 'GET') return adminState();
    if (url === '/api/auth/logout' && method === 'POST') {
      const { error } = await sb.auth.signOut(); fail(error); return { ok: true };
    }
    if (url === '/api/admin/participants' && method === 'POST') {
      const { data, error } = await sb.rpc('admin_add_participant', { p_name: body.name }); fail(error); return { ok: true, participant: data };
    }
    if (url === '/api/admin/participants' && method === 'DELETE') {
      const { data, error } = await sb.rpc('admin_clear_participants'); fail(error); return { ok: true, removed: data };
    }
    let match = url.match(/^\/api\/admin\/participants\/([^/]+)$/);
    if (match && method === 'DELETE') {
      const { error } = await sb.rpc('admin_remove_participant', { p_id: match[1] }); fail(error); return { ok: true };
    }
    if (url === '/api/admin/draw' && method === 'POST') {
      const { data, error } = await sb.rpc('perform_draw', { p_count: Number(body.count) }); fail(error); return data;
    }
    if (url === '/api/public/draw' && method === 'POST') {
      const { data, error } = await sb.rpc('perform_draw', { p_count: Number(body.count) }); fail(error); return data;
    }
    match = url.match(/^\/api\/(?:admin|public)\/draw\/([^/]+)\/redraw$/);
    if (match && method === 'POST') {
      const { data, error } = await sb.rpc('redraw_winner', { p_draw_id: match[1] }); fail(error); return data;
    }
    if (url === '/api/admin/draw/reset' && method === 'POST') {
      const { data, error } = await sb.rpc('admin_reset_draw', { p_clear_participants: body.clear_participants === true }); fail(error); return data;
    }
    if (url === '/api/admin/draw/history' && method === 'DELETE') {
      const { data, error } = await sb.rpc('admin_clear_draw_history'); fail(error); return { ok: true, deleted: data };
    }
    if (url === '/api/admin/settings' && method === 'PUT') { await updateSettings(body); return { ok: true }; }
    if (url === '/api/admin/upload/background' && method === 'POST') return uploadFile(body, 'backgrounds');
    if (url === '/api/admin/upload/link-icon' && method === 'POST') return uploadFile(body, 'link-icons');
    if (url === '/api/admin/upload/music' && method === 'POST') return uploadFile(body, 'music');
    if (url === '/api/admin/upload/music' && method === 'DELETE') {
      await updateSettings({ music_file: '', music_title: '', music_enabled: false }); return { ok: true };
    }
    if (url === '/api/admin/links' && method === 'POST') {
      const { data: last, error: lastError } = await sb.from('links').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      fail(lastError);
      const { error } = await sb.from('links').insert({
        label: body.label, url: body.url, icon: body.icon || '💗', icon_type: body.icon_type || 'emoji',
        icon_image_url: body.icon_image_url || null, color: body.color || '#f3a6c8',
        sort_order: (last?.sort_order || 0) + 1, enabled: true
      });
      fail(error); return { ok: true };
    }
    match = url.match(/^\/api\/admin\/links\/([^/]+)$/);
    if (match && method === 'PUT') { const { error } = await sb.from('links').update(body).eq('id', match[1]); fail(error); return { ok: true }; }
    if (match && method === 'DELETE') { const { error } = await sb.from('links').delete().eq('id', match[1]); fail(error); return { ok: true }; }
    if (url === '/api/admin/users' && method === 'POST') {
      const { error } = await sb.rpc('set_user_role_by_email', { p_email: body.email, p_role: body.role }); fail(error); return { ok: true };
    }
    match = url.match(/^\/api\/admin\/users\/([^/]+)\/draw-permission$/);
    if (match && method === 'PUT') {
      const { error } = await sb.rpc('admin_set_draw_permission', { p_user_id: match[1], p_can_draw: body.can_draw === true }); fail(error); return { ok: true };
    }
    match = url.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (match && method === 'DELETE') { const { error } = await sb.rpc('revoke_user_access', { p_user_id: match[1] }); fail(error); return { ok: true }; }
    if (url === '/api/admin/profile/username' && method === 'PUT') {
      const { data, error } = await sb.rpc('update_my_username', { p_username: body.username }); fail(error); return { username: data };
    }
    if (url === '/api/admin/change-password' && method === 'POST') {
      const { data: { user }, error: userError } = await sb.auth.getUser(); fail(userError);
      if (!user?.email) throw new Error('Não foi possível identificar a conta atual.');
      const { error: verifyError } = await sb.auth.signInWithPassword({ email: user.email, password: body.current_password }); fail(verifyError);
      const { error } = await sb.auth.updateUser({ password: body.new_password }); fail(error); return { ok: true };
    }
    throw new Error('Ação não reconhecida pelo painel. Atualize os arquivos do projeto.');
  };
})();
