(() => {
  const $ = id => document.getElementById(id);
  const form = $('loginForm');
  const message = $('loginMessage');
  const sb = window.roletaSupabase;
  let mode = 'login';
  let ownerExists = true;
  const base = './';

  function showMode(next) {
    mode = next;
    const firstSetup = !ownerExists && next === 'signup';
    $('loginEyebrow').textContent = firstSetup ? 'PRIMEIRO ACESSO' : next === 'signup' ? 'CADASTRO DE CONTA' : 'ÁREA RESTRITA';
    $('loginTitle').textContent = firstSetup ? 'Crie sua conta de proprietária' : next === 'signup' ? 'Crie sua conta' : 'Que bom te ver!';
    $('loginDescription').textContent = firstSetup
      ? 'A primeira conta será a proprietária e terá controle total do site.'
      : next === 'signup' ? 'Contas novas aguardam autorização do proprietário antes de acessar o painel.' : 'Entre com seu e-mail e senha para acessar o painel.';
    $('loginButton').innerHTML = next === 'signup' ? 'Criar conta <span>♡</span>' : 'Entrar no painel <span>♡</span>';
    $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    $('toggleSignup').textContent = next === 'signup' ? 'Já tenho uma conta — entrar' : 'Criar uma conta autorizada';
    message.textContent = '';
  }

  async function init() {
    if (!sb) {
      message.textContent = 'A biblioteca do Supabase não carregou. Atualize a página e tente novamente.';
      return;
    }
    try {
      const { data: sessionData, error: sessionError } = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData?.session;

      if (session?.user) {
        const { data: profile, error: profileError } = await sb.from('profiles')
          .select('role').eq('id', session.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (profile && profile.role !== 'pending') {
          window.location.href = `${base}admin.html`;
          return;
        }
        message.textContent = 'Sua conta ainda aguarda autorização do proprietário.';
        await sb.auth.signOut();
      }

      // If this helper RPC is temporarily unavailable, do not block an existing owner
      // from reaching the sign-in form. The SQL repair file also recreates this function.
      try {
        const { data: ownerData, error: ownerError } = await sb.rpc('owner_exists');
        if (ownerError) throw ownerError;
        ownerExists = Boolean(ownerData);
      } catch (ownerError) {
        console.warn('Não foi possível verificar owner_exists; exibindo login padrão.', ownerError);
        ownerExists = true;
      }
      showMode(ownerExists ? 'login' : 'signup');
    } catch (error) {
      showMode('login');
      message.textContent = `Não foi possível verificar sua sessão: ${error.message || 'verifique a conexão com o Supabase'}`;
    }
  }

  $('toggleSignup').addEventListener('click', () => showMode(mode === 'signup' ? 'login' : 'signup'));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('loginButton');
    const email = $('username').value.trim().toLowerCase();
    const password = $('password').value;
    button.disabled = true;
    message.textContent = '';
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          message.textContent = 'Conta criada! Confira seu e-mail para confirmar o cadastro. Depois volte aqui e faça login.';
          showMode('login');
          return;
        }
        const { data: profile, error: profileError } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (profile?.role === 'owner') window.location.href = `${base}admin.html`;
        else { await sb.auth.signOut(); message.textContent = 'Conta criada. Peça ao proprietário para autorizar seu e-mail no painel.'; showMode('login'); }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: profile, error: profileError } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (!profile || profile.role === 'pending') {
          await sb.auth.signOut();
          throw new Error('Sua conta ainda não foi autorizada pelo proprietário.');
        }
        window.location.href = `${base}admin.html`;
      }
    } catch (error) {
      message.textContent = error.message || 'Não foi possível autenticar.';
    } finally { button.disabled = false; }
  });
  init();
})();
