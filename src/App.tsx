import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  FileArchive,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  Library,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './App.css'

type Category = 'Previous year' | 'IA papers' | 'Notes' | 'Other'
type Resource = {
  id: string
  title: string
  course_code: string
  course_title: string
  category: Category
  academic_year: string
  semester: number
  description: string
  file_name: string
  file_size: number
  created_at: string
  download_count: number
  storage_path: string
}
type Profile = { full_name: string; role: 'student' | 'teacher'; campus_id: string | null }

const categories: Category[] = ['Previous year', 'IA papers', 'Notes', 'Other']
const demoResources: Resource[] = [
  { id: '1', title: 'End Semester Examination · May 2025', course_code: 'CS301', course_title: 'Data Structures & Algorithms', category: 'Previous year', academic_year: '2024–25', semester: 4, description: 'End semester question paper with all sections.', file_name: 'CS301_Endsem_May_2025.pdf', file_size: 2_400_000, created_at: '2026-04-16T08:30:00Z', download_count: 184, storage_path: '' },
  { id: '2', title: 'Internal Assessment 2 · March 2026', course_code: 'MA204', course_title: 'Linear Algebra', category: 'IA papers', academic_year: '2025–26', semester: 4, description: 'IA-2 paper. Includes the complete problem set.', file_name: 'MA204_IA2_Mar_2026.pdf', file_size: 980_000, created_at: '2026-04-15T10:15:00Z', download_count: 96, storage_path: '' },
  { id: '3', title: 'Unit 3 · Graphs & Greedy Methods', course_code: 'CS301', course_title: 'Data Structures & Algorithms', category: 'Notes', academic_year: '2025–26', semester: 4, description: 'Annotated lecture notes covering shortest paths and MSTs.', file_name: 'CS301_Unit3_Graphs.pdf', file_size: 5_100_000, created_at: '2026-04-14T12:45:00Z', download_count: 231, storage_path: '' },
  { id: '4', title: 'End Semester Examination · Dec 2024', course_code: 'EC210', course_title: 'Signals & Systems', category: 'Previous year', academic_year: '2024–25', semester: 3, description: 'December end semester paper, all branches.', file_name: 'EC210_Endsem_Dec_2024.pdf', file_size: 1_700_000, created_at: '2026-04-12T09:10:00Z', download_count: 143, storage_path: '' },
  { id: '5', title: 'IA 1 · Question paper + solutions', course_code: 'CS205', course_title: 'Database Management Systems', category: 'IA papers', academic_year: '2025–26', semester: 3, description: 'Question paper with faculty-approved answer key.', file_name: 'CS205_IA1_Solutions.pdf', file_size: 1_200_000, created_at: '2026-04-10T14:00:00Z', download_count: 78, storage_path: '' },
  { id: '6', title: 'Quick revision · Normalization', course_code: 'CS205', course_title: 'Database Management Systems', category: 'Notes', academic_year: '2025–26', semester: 3, description: 'A concise guide to normal forms and functional dependencies.', file_name: 'CS205_Normalization_Notes.pdf', file_size: 740_000, created_at: '2026-04-08T11:20:00Z', download_count: 112, storage_path: '' },
  { id: '7', title: 'End Semester Examination · May 2024', course_code: 'MA204', course_title: 'Linear Algebra', category: 'Previous year', academic_year: '2023–24', semester: 4, description: 'End semester question paper, May 2024.', file_name: 'MA204_Endsem_May_2024.pdf', file_size: 1_500_000, created_at: '2026-04-04T07:40:00Z', download_count: 67, storage_path: '' },
]

const prettySize = (bytes: number) => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} KB`

function App() {
  const [resources, setResources] = useState<Resource[]>(isSupabaseConfigured ? [] : demoResources)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | 'All resources' | 'Saved'>('All resources')
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('All courses')
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authMessage, setAuthMessage] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [resendingConfirmation, setResendingConfirmation] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const demoMode = !isSupabaseConfigured
  const isTeacher = profile?.role === 'teacher'
  const canUpload = !demoMode && isTeacher

  const loadCampusResources = async (userId: string) => {
    if (!supabase) return
    const { data: member } = await supabase.from('profiles').select('full_name, role, campus_id').eq('id', userId).maybeSingle()
    if (!member) {
      setProfile(null)
      setResources([])
      return
    }
    setProfile(member as Profile)
    if (!member.campus_id) {
      setResources([])
      return
    }
    const { data, error } = await supabase.from('resources').select('*').eq('campus_id', member.campus_id).order('created_at', { ascending: false })
    if (error) {
      setToast('Could not load resources. Check your campus access.')
      return
    }
    setResources((data ?? []) as Resource[])
  }

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setUserEmail(session?.user.email ?? '')
      if (session?.user) void loadCampusResources(session.user.id)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? '')
      if (session?.user) window.setTimeout(() => void loadCampusResources(session.user.id), 0)
      else {
        setProfile(null)
        setResources([])
      }
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const courses = useMemo(() => ['All courses', ...new Set(resources.map((item) => `${item.course_code} · ${item.course_title}`))], [resources])
  const visibleResources = useMemo(() => resources.filter((resource) => {
    const matchesCategory = activeCategory === 'All resources' || (activeCategory === 'Saved' ? savedIds.includes(resource.id) : resource.category === activeCategory)
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${resource.title} ${resource.course_code} ${resource.course_title} ${resource.description}`.toLowerCase().includes(query)
    const matchesCourse = courseFilter === 'All courses' || `${resource.course_code} · ${resource.course_title}` === courseFilter
    return matchesCategory && matchesSearch && matchesCourse
  }), [resources, activeCategory, search, courseFilter, savedIds])

  const selectCategory = (category: typeof activeCategory) => {
    setActiveCategory(category)
    setMobileNavOpen(false)
  }

  const toggleSaved = (id: string) => setSavedIds((current) => current.includes(id) ? current.filter((saved) => saved !== id) : [...current, id])

  const downloadResource = async (resource: Resource) => {
    if (supabase && resource.storage_path) {
      const { data, error } = await supabase.storage.from('campus-resources').createSignedUrl(resource.storage_path, 60)
      if (error || !data?.signedUrl) { setToast('This file is not available right now.'); return }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      void supabase.rpc('increment_resource_download', { resource_id: resource.id })
      return
    }
    setToast(demoMode ? 'Demo resource: connect Supabase to download the file.' : 'This file is not available right now.')
  }

  const submitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canUpload) {
      setToast('Only faculty members can upload resources.')
      return
    }
    const form = new FormData(event.currentTarget)
    const file = form.get('file') as File
    if (!file || file.size > 20 * 1024 * 1024) { setToast('Choose a file smaller than 20 MB.'); return }
    const category = form.get('category') as Category
    const resource: Resource = {
      id: crypto.randomUUID(), title: String(form.get('title')).trim(), course_code: String(form.get('course_code')).trim().toUpperCase(),
      course_title: String(form.get('course_title')).trim(), category, academic_year: String(form.get('academic_year')).trim(),
      semester: Number(form.get('semester')), description: String(form.get('description')).trim(), file_name: file.name,
      file_size: file.size, created_at: new Date().toISOString(), download_count: 0, storage_path: '',
    }
    if (supabase) {
      if (!profile?.campus_id || !userEmail) { setToast('Your account needs a campus assignment before uploading.'); return }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${profile.campus_id}/${category.toLowerCase().replaceAll(' ', '-')}/${resource.id}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('campus-resources').upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
      if (uploadError) { setToast(uploadError.message); return }
      const { error: insertError } = await supabase.from('resources').insert({ ...resource, storage_path: path, campus_id: profile.campus_id, uploaded_by: (await supabase.auth.getUser()).data.user?.id })
      if (insertError) {
        await supabase.storage.from('campus-resources').remove([path])
        setToast(insertError.message)
        return
      }
      resource.storage_path = path
    }
    setResources((current) => [resource, ...current])
    setShowUpload(false)
    setToast('Resource added to the library.')
  }

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    setAuthMessage('')
    const result = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get('full_name')).trim() } } })
    if (result.error) { setAuthMessage(result.error.message); return }
    if (authMode === 'signup' && !result.data.session) {
      setConfirmationEmail(email)
      setAuthMessage('If an account needs confirmation, check your inbox and spam folder. You can request another email below.')
    }
    else { setShowAuth(false); setToast('You are signed in.') }
  }

  const resendConfirmation = async () => {
    if (!supabase || !confirmationEmail || resendingConfirmation) return
    setResendingConfirmation(true)
    setAuthMessage('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: confirmationEmail })
    setAuthMessage(error ? error.message : 'Confirmation email requested. Check your inbox and spam folder.')
    setResendingConfirmation(false)
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
    setToast('Signed out.')
  }

  const heading = activeCategory === 'All resources' ? 'All resources' : activeCategory === 'Saved' ? 'Your saved resources' : activeCategory

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#home" onClick={() => selectCategory('All resources')}>
          <span className="brand-mark"><Library size={19} strokeWidth={2.2} /></span>
          <span>campus<span className="brand-light">vault</span><small>YOUR COLLEGE, IN ONE PLACE</small></span>
        </a>
        <div className="nav-label">LIBRARY</div>
        <nav className="side-nav" aria-label="Resource categories">
          <button className={activeCategory === 'All resources' ? 'nav-item active' : 'nav-item'} onClick={() => selectCategory('All resources')}><FolderOpen size={18} /><span>All resources</span><span className="nav-count">{resources.length}</span></button>
          {categories.map((category) => <button key={category} className={activeCategory === category ? 'nav-item active' : 'nav-item'} onClick={() => selectCategory(category)}>{category === 'Previous year' ? <FileArchive size={18} /> : category === 'IA papers' ? <FileText size={18} /> : <BookOpen size={18} />}<span>{category}</span></button>)}
          <button className={activeCategory === 'Saved' ? 'nav-item active' : 'nav-item'} onClick={() => selectCategory('Saved')}><Bookmark size={18} /><span>Saved</span><span className="nav-count">{savedIds.length || ''}</span></button>
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-label">YOUR SPACE</div>
        <div className="campus-card">
          <div className="campus-icon"><GraduationCap size={18} /></div>
          <div><strong>{profile?.campus_id ? 'My campus' : 'College library'}</strong><span>{profile?.role === 'teacher' ? 'Faculty workspace' : 'Student access'}</span></div>
          <ShieldCheck size={15} className="campus-shield" />
        </div>
        <div className="sidebar-bottom">
          <div className="storage-note"><span className="storage-dot" />{demoMode ? 'Preview workspace' : 'Private college library'}</div>
          <button className="profile-button" onClick={() => userEmail ? void signOut() : demoMode ? setToast('You are viewing the sample library.') : setShowAuth(true)}>
            <span className="avatar">{userEmail ? userEmail[0].toUpperCase() : 'S'}</span>
            <span className="profile-copy"><strong>{userEmail ? (profile?.full_name || userEmail.split('@')[0]) : 'Student account'}</strong><small>{userEmail ? 'Click to sign out' : demoMode ? 'Demo mode' : 'Sign in to your college'}</small></span>
            {userEmail ? <LogOut size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <main className="main-area" id="home">
        <header className="topbar">
          <button className="icon-button menu-toggle" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Library</span><span className="crumb-slash">/</span><strong>{activeCategory === 'All resources' ? 'Overview' : activeCategory}</strong></div>
          <div className="topbar-actions">
            <span className={`mode-pill ${demoMode ? 'preview-pill' : ''}`}><span />{demoMode ? 'Preview' : userEmail ? 'College access' : 'Sign in required'}</span>
            {canUpload && <button className="upload-button" onClick={() => { setShowUpload(true) }}><Plus size={17} /> <span>Upload resource</span></button>}
            {isSupabaseConfigured && !userEmail && <button className="signin-button" onClick={() => { setAuthMode('signin'); setShowAuth(true) }}>Sign in</button>}
          </div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><Sparkles size={14} /> THE CAMPUS LIBRARY</div>
              <h1>Good things <em>are</em><br className="mobile-break" /> worth sharing.</h1>
              <p className="welcome-copy">Papers, notes, and the little things that make the semester easier.</p>
            </div>
            <div className="welcome-image" role="img" aria-label="Sunlight falling across a university library reading room">
              <div className="image-caption"><span>FROM YOUR COLLEGE</span><strong>Shared knowledge,<br />one semester at a time.</strong></div>
              <div className="image-index">01 <span>/</span> 04</div>
            </div>
          </section>

          <section className="stats-strip" aria-label="Library overview">
            <div className="stat"><span className="stat-icon stat-orange"><FileArchive size={17} /></span><span><strong>{resources.filter((item) => item.category === 'Previous year').length}</strong><small>Past papers</small></span></div>
            <div className="stat"><span className="stat-icon stat-green"><FileText size={17} /></span><span><strong>{resources.filter((item) => item.category === 'IA papers').length}</strong><small>IA papers</small></span></div>
            <div className="stat"><span className="stat-icon stat-blue"><BookOpen size={17} /></span><span><strong>{resources.filter((item) => item.category === 'Notes').length}</strong><small>Study notes</small></span></div>
            <div className="stats-footnote"><span className="online-dot" /> Updated by your campus community</div>
          </section>

          <section className="library-section">
            <div className="section-heading">
              <div><div className="eyebrow section-eyebrow">FIND YOUR NEXT STUDY SESSION</div><h2>{heading}<span className="heading-count">{visibleResources.length}</span></h2></div>
              <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search papers, courses..." aria-label="Search resources" />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}</label>
            </div>

            <div className="filter-row">
              <div className="filter-tabs" role="group" aria-label="Filter by resource type">
                {(['All resources', ...categories] as const).map((category) => <button key={category} className={activeCategory === category ? 'filter-tab selected' : 'filter-tab'} onClick={() => selectCategory(category)}>{category === 'All resources' ? 'Everything' : category}</button>)}
              </div>
              <label className="course-select"><Filter size={15} /><select aria-label="Filter by course" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>{courses.map((course) => <option key={course}>{course}</option>)}</select><ChevronDown size={14} /></label>
            </div>

            {loading ? <div className="empty-state"><span className="loading-ring" /><strong>Opening your campus library…</strong></div> : visibleResources.length ? <div className="resource-list">
              <div className="list-header"><span>RESOURCE</span><span>COURSE</span><span>ADDED</span><span>FILE</span><span aria-label="Actions" /></div>
              {visibleResources.map((resource) => <article className="resource-row" key={resource.id}>
                <div className="resource-main"><span className={`file-icon ${resource.category === 'Previous year' ? 'file-orange' : resource.category === 'IA papers' ? 'file-blue' : 'file-green'}`}><FileText size={18} /></span><div className="resource-title"><strong>{resource.title}</strong><span>{resource.category}<i /> Sem {resource.semester} <i /> {resource.academic_year}</span></div></div>
                <div className="course-cell"><strong>{resource.course_code}</strong><span>{resource.course_title}</span></div>
                <div className="date-cell">{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(resource.created_at))}</div>
                <div className="file-cell"><span>{resource.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'}</span>{prettySize(resource.file_size)}</div>
                <div className="row-actions"><button className={`icon-button save-button ${savedIds.includes(resource.id) ? 'is-saved' : ''}`} aria-label={savedIds.includes(resource.id) ? 'Remove saved resource' : 'Save resource'} title="Save resource" onClick={() => toggleSaved(resource.id)}><Bookmark size={17} fill={savedIds.includes(resource.id) ? 'currentColor' : 'none'} /></button><button className="download-button" aria-label={`Download ${resource.title}`} title="Download resource" onClick={() => void downloadResource(resource)}><ArrowDownToLine size={17} /></button></div>
              </article>)}
            </div> : <div className="empty-state"><span className="empty-icon"><FolderOpen size={22} /></span><strong>{resources.length ? 'Nothing matches those filters.' : userEmail && !profile?.campus_id ? 'Your college is setting up access.' : userEmail ? 'Your campus library is ready.' : 'Sign in to open your college library.'}</strong><span>{resources.length ? 'Try another search or course.' : userEmail && !profile?.campus_id ? 'Ask your college administrator to assign your campus.' : profile?.campus_id ? 'Check back as faculty shares course materials.' : 'Resources are shared privately with students from your college.'}</span>{!resources.length && canUpload && <button className="upload-button" onClick={() => { setShowUpload(true) }}><Plus size={16} /> Add the first resource</button>}{!resources.length && isSupabaseConfigured && !userEmail && <button className="upload-button" onClick={() => setShowAuth(true)}>Sign in to continue</button>}</div>}
            <div className="library-footer"><span><ShieldCheck size={15} /> Shared by your college. Always free.</span><span>{visibleResources.length} {visibleResources.length === 1 ? 'resource' : 'resources'} shown</span></div>
          </section>

          <footer className="page-footer"><span>Made for the margins, the midterms, and everything in between.</span><span>CampusVault <i>·</i> College library</span></footer>
        </div>
      </main>

      {showUpload && canUpload && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowUpload(false) }}><section className="modal upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title"><div className="modal-heading"><div><div className="eyebrow">CONTRIBUTE TO THE LIBRARY</div><h2 id="upload-title">Add a resource</h2></div><button className="icon-button" aria-label="Close upload form" onClick={() => setShowUpload(false)}><X size={19} /></button></div><form onSubmit={(event) => void submitUpload(event)}>
        <div className="form-grid"><label className="field field-wide"><span>Resource title</span><input name="title" placeholder="e.g. End Semester Examination · May 2025" required maxLength={120} /></label><label className="field"><span>Resource type</span><select name="category" required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field"><span>Academic year</span><input name="academic_year" placeholder="2025–26" required maxLength={20} /></label><label className="field"><span>Course code</span><input name="course_code" placeholder="CS301" required maxLength={20} /></label><label className="field"><span>Course name</span><input name="course_title" placeholder="Data Structures & Algorithms" required maxLength={100} /></label><label className="field"><span>Semester</span><select name="semester" defaultValue="4">{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>Semester {index + 1}</option>)}</select></label><label className="field field-wide"><span>Short description <small>Optional</small></span><textarea name="description" placeholder="What should students know about this file?" rows={2} maxLength={280} /></label><label className="file-drop field-wide"><input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg" required /><Upload size={19} /><span><strong>Choose a file</strong> or drop it here</span><small>PDF, documents, slides, or images · up to 20 MB</small></label></div>
        <div className="modal-actions"><span><ShieldCheck size={15} /> Visible only to your college</span><button className="upload-button" type="submit"><Upload size={16} /> Add to library</button></div>
      </form></section></div>}

      {showAuth && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuth(false) }}><section className="modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-button auth-close" aria-label="Close sign in" onClick={() => setShowAuth(false)}><X size={19} /></button><span className="auth-mark"><Library size={22} /></span><div className="eyebrow">YOUR CAMPUS, TOGETHER</div><h2 id="auth-title">{authMode === 'signin' ? 'Welcome back.' : 'Join your college library.'}</h2><p>Sign in with your college account to access shared resources.</p><form onSubmit={(event) => void submitAuth(event)}>{authMode === 'signup' && <label className="field"><span>Your name</span><input name="full_name" autoComplete="name" required maxLength={80} /></label>}<label className="field"><span>College email</span><input name="email" type="email" autoComplete="email" required /></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /></label>{authMessage && <div className="auth-message">{authMessage}</div>}<button className="upload-button auth-submit" type="submit">{authMode === 'signin' ? 'Sign in' : 'Create account'} <ArrowUpRight size={16} /></button></form>{confirmationEmail && authMode === 'signup' && <div className="auth-switch">No confirmation email? <button type="button" onClick={() => void resendConfirmation()} disabled={resendingConfirmation}>{resendingConfirmation ? 'Sending…' : 'Resend confirmation'}</button></div>}<div className="auth-switch">{authMode === 'signin' ? 'New to CampusVault?' : 'Already have an account?'} <button onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthMessage('') }}>{authMode === 'signin' ? 'Create an account' : 'Sign in'}</button></div><div className="auth-note"><Check size={14} /> Access is limited to your college community.</div></section></div>}

      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </div>
  )
}

export default App