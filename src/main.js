let supabase = null;
let session = null;
let profile = null;
let authReady = false;
let authSubscription = null;

const isDev = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const injectedConfig = window.__SUPABASE_CONFIG__ || {};
const cfg = normalizeConfig(injectedConfig);

function debug(label, details = {}) {
  if (!isDev) return;
  console.info(`[SignSyncer] ${label}`, sanitize(details));
}

function sanitize(value) {
  if (typeof value === 'string') {
    if (value.length > 24 && /eyJ|sb_|anon|secret|key/i.test(value)) return `${value.slice(0, 6)}…${value.slice(-4)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /key|token|secret|password/i.test(k) ? sanitize(String(v || '')) : sanitize(v)]));
  return value;
}

function normalizeConfig(config) {
  const url = String(config.url || '').trim().replace(/\/+$/, '');
  const key = String(config.key || '').trim();
  return { url, key, valid: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length > 30 };
}

function authRedirect(path) {
  return new URL(path, location.origin).toString();
}

function describeError(error, fallback = 'Unexpected error') {
  if (!error) return '';
  const parts = [error.message || fallback, error.status && `status ${error.status}`, error.code && `code ${error.code}`].filter(Boolean);
  return parts.join(' · ');
}

function networkHelp(error) {
  const msg = String(error?.message || error || '');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Network request failed before Supabase returned a response. Verify the generated Supabase URL, anon key, browser ad blockers, and that the Supabase project is active/reachable.';
  }
  return '';
}

async function init() {
  debug('Loaded Supabase browser config', { url: cfg.url, hasAnonKey: Boolean(cfg.key), keyLength: cfg.key.length, valid: cfg.valid });

  if (cfg.url && cfg.key && cfg.valid) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    supabase = createClient(cfg.url, cfg.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'signsyncer-auth',
      },
      global: {
        headers: { 'X-Client-Info': 'signsyncer-static-web' },
      },
    });
    debug('Supabase client initialized', { authUrl: `${cfg.url}/auth/v1`, redirectOrigin: location.origin });

    const { data, error } = await supabase.auth.getSession();
    if (error) debug('getSession returned an error', error);
    session = data?.session || null;
    authSubscription = supabase.auth.onAuthStateChange(async (event, newSession) => {
      debug('Auth state changed', { event, hasSession: Boolean(newSession) });
      session = newSession;
      profile = session ? await ensureProfile() : null;
      route(location.pathname);
    }).data.subscription;
    if (session) profile = await ensureProfile();
  } else if (cfg.url || cfg.key) {
    debug('Invalid Supabase config detected', { url: cfg.url, hasAnonKey: Boolean(cfg.key), keyLength: cfg.key.length });
  }

  authReady = true;
  route(location.pathname);
}

async function ensureProfile() {
  if (!supabase || !session) return null;
  const base = { id: session.user.id, full_name: session.user.user_metadata?.full_name || '', role: 'user' };
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) {
    notify(describeError(error, 'Could not load profile'), 'error');
    debug('Profile load failed', error);
    return null;
  }
  if (data) return data;
  const inserted = await supabase.from('profiles').insert(base).select('*').single();
  if (inserted.error) {
    debug('Profile insert failed', inserted.error);
    notify(describeError(inserted.error, 'Could not create profile'), 'error');
    return null;
  }
  return inserted.data;
}

function go(p) { history.pushState(null, '', p); route(p); scrollTo(0, 0); }
addEventListener('popstate', () => route(location.pathname));

function shell(content) {
  document.title = 'SignSyncer';
  app.innerHTML = `<header><a class=brand>◆ SignSyncer</a><button class=mobile>Menu</button><nav>${['Features','Pricing','Security'].map(x=>`<a data-go="/${x.toLowerCase()}">${x}</a>`).join('')}<a data-go="/support">Support</a>${session?`<a data-go="/dashboard">Dashboard</a><button id=logout>Logout</button>`:`<button data-go="/login">Log in</button><button class=primary data-go="/signup">Start free</button>`}</nav></header>${!supabase?`<div class=setup>⚠️ Supabase is not connected. Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were present during the Vercel build and that the URL is exactly https://PROJECT.supabase.co.</div>`:''}<main>${content}</main><footer><b>SignSyncer</b><a data-go="/privacy">Privacy</a><a data-go="/terms">Terms</a><a data-go="/contact">Contact</a></footer>`;
  bindNav(); document.querySelector('.brand').onclick = () => go('/'); document.querySelector('.mobile').onclick = () => document.querySelector('nav').classList.toggle('show');
  const lo = document.getElementById('logout'); if (lo) lo.onclick = async () => { const { error } = await supabase.auth.signOut(); if (error) return notify(describeError(error), 'error'); session = null; profile = null; go('/'); };
}
function bindNav(){document.querySelectorAll('[data-go]').forEach(e=>e.onclick=()=>go(e.dataset.go))}
function notify(message, type='info'){let box=document.querySelector('.msg'); if(box){box.className=`msg ${type}`; box.textContent=message;} else alert(message);}
function page(t,b){return shell(`<section><h1>${t}</h1><p>${b}</p></section>`)}
function protectedPage(fn){if(!authReady)return shell('<section><h1>Loading…</h1></section>'); if(!session){go('/login'); return;} return fn()}
function route(p){if(p.startsWith('/support/ticket/'))return protectedPage(()=>ticket(p.split('/').pop()));({ '/':home,'/features':()=>marketing('Features'),'/pricing':pricing,'/security':()=>page('Security','Supabase Auth, Postgres row-level security policies, protected routes and server-side authorization rules are documented for production deployment.'),'/about':()=>page('About SignSyncer','SignSyncer helps teams manage consistent email signature operations.'),'/contact':contact,'/privacy':()=>page('Privacy Policy','Operational privacy policy structure is provided. Have counsel review final legal text before launch.'),'/terms':()=>page('Terms of Service','Operational terms structure is provided. Have counsel review final legal text before launch.'),'/login':()=>auth('login'),'/signup':()=>auth('signup'),'/forgot-password':forgot,'/reset-password':reset,'/verify-email':verifyEmail,'/dashboard':()=>protectedPage(dashboard),'/profile':()=>protectedPage(profilePage),'/settings':()=>protectedPage(settings),'/notifications':()=>protectedPage(notifications),'/support':()=>protectedPage(support),'/support/new':()=>protectedPage(newTicket),'/admin':()=>protectedPage(admin),'/unauthorized':()=>page('Access denied','You do not have permission to open this page.')}[p]||notFound)()}
function home(){shell(`<section class=hero><p class=eyebrow>Production SaaS signature operations</p><h1>Synchronize every email signature without sacrificing security.</h1><p>Manage account profiles, support requests and team-ready signature workflows from one secure portal.</p><button class=primary data-go="${session?'/dashboard':'/signup'}">Get started</button><button data-go="/features">Explore features</button></section>${cards(['Secure authentication','Profile management','Support ticketing','Notifications','Role-aware admin','Vercel-ready routing'])}`);bindNav()}
function marketing(t){shell(`<section><h1>${t}</h1>${cards(['Email signature governance','Customer support workflows','Responsive dashboards','Accessible forms','SEO public pages','Secure data access'])}</section>`)}
function cards(items){return`<div class=grid>${items.map(i=>`<article class=card><h3>✓ ${i}</h3><p>Real application flow designed for Supabase persistence and production RLS.</p></article>`).join('')}</div>`}
function pricing(){shell(`<section><h1>Simple pricing</h1><div class=grid><article class=card><h3>Starter</h3><b>$0</b><p>Evaluate securely.</p><button data-go=/signup>Create account</button></article><article class="card featured"><h3>Business</h3><b>$12/user</b><p>Team workflows and support operations.</p><button data-go=/contact>Contact sales</button></article></div></section>`);bindNav()}
function form(title,body,msg=''){shell(`<section><form class="card form"><h1>${title}</h1>${body}<p class=msg>${msg}</p></form></section>`);bindNav()}
function input(n,t='text'){return`<label>${n}<input required name="${n.toLowerCase().replaceAll(' ','_')}" type=${t}></label>`}
async function runAuth(action){try{return await action()}catch(error){debug('Supabase request threw', error);return{error:{message:error.message||String(error),cause:error}}}}
function auth(mode,redirect='/dashboard'){form(mode==='signup'?'Create account':'Welcome back',`${mode==='signup'?input('Name'):''}${input('Email','email')}${input('Password','password')}${mode==='signup'?input('Confirm password','password'):''}<button class=primary>${mode==='signup'?'Sign up':'Log in'}</button><a data-go=/forgot-password>Forgot password?</a>`);document.querySelector('form').onsubmit=async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));if(!supabase)return notify('Supabase is not configured correctly. Rebuild with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', 'error');if(mode==='signup'){if(f.password.length<12)return notify('Password must be at least 12 characters.','error');if(f.password!==f.confirm_password)return notify('Passwords do not match.','error');debug('Attempting signup',{authUrl:`${cfg.url}/auth/v1/signup`,emailRedirectTo:authRedirect('/verify-email')});let{data,error}=await runAuth(()=>supabase.auth.signUp({email:f.email,password:f.password,options:{data:{full_name:f.name},emailRedirectTo:authRedirect('/verify-email')}}));if(error)return notify(`${describeError(error)} ${networkHelp(error)}`.trim(),'error');debug('Signup response',{userId:data?.user?.id,sessionCreated:Boolean(data?.session)});notify(data?.session?'Account created and signed in.':'Check your email to verify your account.','success')}else{debug('Attempting login',{authUrl:`${cfg.url}/auth/v1/token?grant_type=password`});let{error}=await runAuth(()=>supabase.auth.signInWithPassword({email:f.email,password:f.password}));error?notify(`${describeError(error)} ${networkHelp(error)}`.trim(),'error'):go(redirect)}}}
function forgot(){form('Reset password',`${input('Email','email')}<button class=primary>Send reset link</button>`);document.querySelector('form').onsubmit=async e=>{e.preventDefault();let email=new FormData(e.target).get('email');let{error}=await runAuth(()=>supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirect('/reset-password')}));notify(error?describeError(error):'Password reset email sent.',error?'error':'success')}}
function reset(){form('Choose a new password',`${input('New password','password')}<button class=primary>Update password</button>`);document.querySelector('form').onsubmit=async e=>{e.preventDefault();let password=new FormData(e.target).get('new_password');if(password.length<12)return notify('Password must be at least 12 characters.','error');let{error}=await runAuth(()=>supabase.auth.updateUser({password}));notify(error?describeError(error):'Password updated.',error?'error':'success')}}
function verifyEmail(){page('Email verification','Supabase Auth is processing the verification link. If successful, you will stay signed in and can open the dashboard.'); setTimeout(()=>session&&go('/dashboard'),500)}
function dashShell(content){shell(`<div class=dash><aside>${[['/dashboard','Dashboard'],['/profile','Profile'],['/settings','Settings'],['/support','Support'],['/notifications','Notifications'],['/admin','Admin']].map(x=>`<a data-go="${x[0]}">${x[1]}</a>`).join('')}</aside><section>${content}</section></div>`);bindNav()}
function dashboard(){dashShell(`<h1>Dashboard</h1><div class=grid>${['Email:'+session.user.email,'Role:'+(profile?.role||'user'),'Account:Active'].map(s=>`<article class=card><b>${s.split(':')[0]}</b><p>${s.split(':')[1]}</p></article>`).join('')}</div>`)}
function profilePage(){dashShell(`<h1>Profile</h1><div class="card form"><label>Full name<input id=name value="${profile?.full_name||''}"></label><button class=primary id=save>Save changes</button><p class=msg></p></div>`);save.onclick=async()=>{let{error}=await supabase.from('profiles').update({full_name:name.value,updated_at:new Date().toISOString()}).eq('id',session.user.id);notify(error?describeError(error):'Profile saved.',error?'error':'success');profile=await ensureProfile()}}
function settings(){dashShell(`<h1>Settings</h1>${cards(['General preferences','Security password reset','Notification controls','Account data management'])}`)}
async function notifications(){let{data,error}=await supabase.from('notifications').select('*').order('created_at',{ascending:false});if(error)debug('Notifications query failed',error);let rows=data||[];dashShell(`<h1>Notifications</h1>${error?`<p class="msg error">${describeError(error)}</p>`:rows.length?cards(rows.map(r=>r.title)):'<p class=empty>No notifications yet.</p>'}`)}
async function support(){let{data,error}=await supabase.from('support_tickets').select('*').order('created_at',{ascending:false});let rows=data||[];dashShell(`<h1>Support tickets</h1><button class=primary data-go=/support/new>New ticket</button>${error?`<p class="msg error">${describeError(error)}</p>`:`<div class=grid>${rows.map(t=>`<article class=card><h3>${t.subject}</h3><p>${t.category} · ${t.priority} · ${t.status}</p><button data-go="/support/ticket/${t.id}">Open</button></article>`).join('')||'<p class=empty>No support tickets yet.</p>'}</div>`}`);bindNav()}
function newTicket(){form('Create support ticket',`${input('Subject')}<label>Description<textarea name=description required minlength=10></textarea></label><label>Category<select name=category>${['Technical Issue','Account','Billing','Feature Request','Bug Report','General Question'].map(x=>`<option>${x}</option>`)}</select></label><label>Priority<select name=priority>${['Low','Normal','High','Urgent'].map(x=>`<option>${x}</option>`)}</select></label><button class=primary>Submit ticket</button>`);document.querySelector('form').onsubmit=async e=>{e.preventDefault();let f=Object.fromEntries(new FormData(e.target));let{data,error}=await supabase.from('support_tickets').insert({...f,user_id:session.user.id,status:'Open'}).select().single();error?notify(describeError(error),'error'):go('/support/ticket/'+data.id)}}
async function ticket(id){let{data:t,error}=await supabase.from('support_tickets').select('*').eq('id',id).single();if(error||!t)return page('Ticket not found',describeError(error,'The requested support ticket is unavailable.'));let rows=(await supabase.from('ticket_messages').select('*').eq('ticket_id',id).order('created_at')).data||[];dashShell(`<h1>${t.subject}</h1><p>${t.category} · ${t.priority} · ${t.status}</p>${rows.map(m=>`<article class=card><p>${m.body}</p><small>${new Date(m.created_at).toLocaleString()}</small></article>`).join('')}${['Closed','Resolved'].includes(t.status)?'<p>This ticket is closed.</p>':`<div class=card><textarea id=reply placeholder=Reply></textarea><button class=primary id=send>Send reply</button><p class=msg></p></div>`}`);if(window.send)send.onclick=async()=>{let{error}=await supabase.from('ticket_messages').insert({ticket_id:id,sender_id:session.user.id,body:reply.value});error?notify(describeError(error),'error'):go('/support/ticket/'+id)}}
async function admin(){if(!['admin','support_agent'].includes(profile?.role))return page('Access denied','Admin access requires a support_agent or admin role and is enforced by RLS.');let rows=(await supabase.from('support_tickets').select('*')).data||[];dashShell(`<h1>Support admin</h1>${cards(rows.map(r=>r.subject))}`)}
function contact(){form('Contact us',`${input('Email','email')}<label>Message<textarea required></textarea></label><button class=primary>Send</button><p>For production, connect contact routing to your support inbox or database workflow.</p>`)}
function notFound(){shell(`<section><h1>Page not found</h1><button data-go=/>Go home</button></section>`);bindNav()}

addEventListener('beforeunload', () => authSubscription?.unsubscribe?.());
init();
