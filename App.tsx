import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import { TeacherPanel } from './components/TeacherPanel';
import { LoginModal } from './components/LoginModal';
import { PrintReportPage } from './components/PrintReportPage';
import { LoadingScreen } from './components/LoadingScreen';
import { LandingPage } from './components/LandingPage';
import { BottomNav } from './components/BottomNav';
import { Role, AppUser, Student, StudentStatus } from './types';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore/lite';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { mapStudentData } from './utils';

function App() {
  // Simple Routing Check
  const [isPrintMode, setIsPrintMode] = useState(false);

  useEffect(() => {
    if (window.location.pathname === '/print-report') {
      setIsPrintMode(true);
    }
  }, []);

  const [view, setView] = useState<'landing' | 'dashboard' | 'admin' | 'teacher'>('landing');
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showTeacherLogin, setShowTeacherLogin] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isMinLoadingComplete, setIsMinLoadingComplete] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);

  // Minimum loading time to show the loading screen (5 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMinLoadingComplete(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Handle transition from loading to content
  useEffect(() => {
    if (!isLoadingAuth && isMinLoadingComplete && !isTransitioning && !showContent) {
      // Start transition animation
      setIsTransitioning(true);
      setTimeout(() => {
        setShowContent(true);
      }, 400); // Match CSS transition duration
    }
  }, [isLoadingAuth, isMinLoadingComplete, isTransitioning, showContent]);

  useEffect(() => {
    // Listen to auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as AppUser;
            setCurrentUser({ ...userData, id: user.uid });
            // Determine view based on role
            if (userData.role === Role.ADMIN) setView('admin');
            else if (userData.role === Role.TEACHER) setView('teacher');
          } else {
            // User exists in Auth but not in Firestore users collection (or deleted)
            console.error("User data not found in Firestore");
            setCurrentUser(null);
          }
        } catch (e) {
          console.error("Error fetching user data", e);
        }
      } else {
        setCurrentUser(null);
        setView('landing');
      }
      setIsLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);



  const fetchStudents = React.useCallback(async (force = false) => {
    try {
      const CACHE_KEY = 'cached_students';
      const TIME_KEY = 'cached_students_time';
      const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

      const cachedData = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(TIME_KEY);
      const now = Date.now();

      if (!force && cachedData && cachedTime) {
        const age = now - parseInt(cachedTime);
        if (age < CACHE_DURATION) {
          console.log(`Using cached student data (${(age / 1000 / 60).toFixed(1)} mins old)`);
          setStudents(JSON.parse(cachedData));
          return;
        }
      }

      console.log("Fetching fresh student data from Firestore");
      const q = query(collection(db, 'students'), orderBy('grade'), orderBy('number'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => mapStudentData(doc.id, doc.data()));

      setStudents(data);

      // Save to cache
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(TIME_KEY, now.toString());
        if (force) alert("อัปเดตข้อมูลเรียบร้อยแล้ว");
      } catch (err) {
        console.error("Failed to save student cache", err);
      }

    } catch (e) {
      console.error("Error fetching students", e);
      if (force) alert("เกิดข้อผิดพลาดในการอัปเดตข้อมูล");
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleLogin = async (username: string, pass: string, intendedRole: Role) => {
    // Sanitize input: Remove ALL whitespace and convert to lowercase
    const cleanUsername = username.replace(/\s+/g, '').toLowerCase();
    const cleanPass = pass.trim();

    if (!cleanUsername || !cleanPass) {
      throw new Error("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
    }

    try {
      // Check if user entered a full email, if not, append the local domain
      // Note: For 'admin' -> 'admin@school.local'
      const email = cleanUsername.includes('@')
        ? cleanUsername
        : `${cleanUsername}@school.local`;

      const userCredential = await signInWithEmailAndPassword(auth, email, cleanPass);

      // Verify Role immediately
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as AppUser;
        if (userData.role !== intendedRole) {
          await signOut(auth);
          throw new Error(intendedRole === Role.ADMIN
            ? "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานในส่วนของผู้ดูแลระบบ"
            : "บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานในส่วนของครู");
        }
      } else {
        await signOut(auth);
        throw new Error("ไม่พบข้อมูลผู้ใช้ในระบบ");
      }

      // Successful login will trigger onAuthStateChanged
      if (intendedRole === Role.ADMIN) setShowAdminLogin(false);
      if (intendedRole === Role.TEACHER) setShowTeacherLogin(false);

    } catch (error: any) {
      console.error("Login failed", error);
      let errorMessage = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') errorMessage = "ไม่พบชื่อผู้ใช้นี้ หรือรหัสผ่านผิด (หากเพิ่งสมัครและล็อกอินไม่ได้ โปรดติดต่อ Admin)";
      else if (error.code === 'auth/wrong-password') errorMessage = "รหัสผ่านไม่ถูกต้อง";
      else if (error.code === 'auth/invalid-email') errorMessage = "รูปแบบชื่อผู้ใช้ไม่ถูกต้อง";
      else if (error.code === 'auth/too-many-requests') errorMessage = "ทำรายการซ้ำเกินกำหนด กรุณารอสักครู่";

      // Throw error to be caught by the Modal UI
      throw new Error(errorMessage);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setView('landing');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // RENDER PRINT PAGE IF ROUTE MATCHES
  if (isPrintMode) {
    return <PrintReportPage />;
  }

  // Show loading screen with fade-out transition
  if (!showContent) {
    return (
      <div className={`transition-all duration-400 ${isTransitioning ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}>
        <LoadingScreen />
      </div>
    );
  }

  // Show Landing Page with fade-in animation
  if (view === 'landing' && !currentUser) {
    return (
      <div className="animate-fade-in">
        <LandingPage
          onGoToDashboard={() => setView('dashboard')}
          onLoginAdmin={() => setShowAdminLogin(true)}
          onLoginTeacher={() => setShowTeacherLogin(true)}
        />
        <LoginModal
          isOpen={showAdminLogin}
          onClose={() => setShowAdminLogin(false)}
          title="เข้าสู่ระบบผู้ดูแล"
          buttonColor="red"
          onLogin={(u, p) => handleLogin(u, p, Role.ADMIN)}
        />
        <LoginModal
          isOpen={showTeacherLogin}
          onClose={() => setShowTeacherLogin(false)}
          title="เข้าสู่ระบบครู"
          buttonColor="green"
          onLogin={(u, p) => handleLogin(u, p, Role.TEACHER)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans pb-20 md:pb-0">
      <Header
        currentUser={currentUser}
        onLoginAdmin={() => setShowAdminLogin(true)}
        onLoginTeacher={() => setShowTeacherLogin(true)}
        onLogout={handleLogout}
        onRefresh={() => fetchStudents(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'dashboard' && <Dashboard students={students} />}

        {view === 'admin' && currentUser?.role === Role.ADMIN && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800">ระบบผู้ดูแล</h2>
              <p className="text-gray-500">จัดการข้อมูลนักเรียน ครู และการตั้งค่าระบบ</p>
            </div>
            <AdminPanel onSwitchToTeacherView={() => setView('teacher')} onLogout={handleLogout} />
          </div>
        )}

        {view === 'teacher' && (
          <div className="animate-fade-in">
            <div className="mb-6 print:hidden">
              <h2 className="text-2xl font-bold text-gray-800">ระบบครู</h2>
              <p className="text-gray-500">บันทึกการมาเรียนและรายงานสถิติ</p>
            </div>
            <TeacherPanel
              currentUser={currentUser!}
              allStudents={students.filter(s => s.status !== StudentStatus.WITHDRAWN)}
              onBackToAdmin={currentUser?.role === Role.ADMIN ? () => setView('admin') : undefined}
              onLogout={handleLogout}
            />
          </div>
        )}

        {/* Access Denied / Fallback */}
        {(view !== 'dashboard' && !currentUser) && (
          <div className="text-center mt-20">
            <p className="text-red-500">กรุณาเข้าสู่ระบบ</p>
          </div>
        )}

        {/* Wrong Role Warning (Show only if user is NOT admin trying to access admin, and NOT teacher trying to access teacher) */}
        {(view === 'admin' && currentUser && currentUser.role !== Role.ADMIN) && (
          <div className="text-center mt-20">
            <p className="text-red-500">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (สำหรับผู้ดูแลระบบเท่านั้น)</p>
          </div>
        )}
      </main>

      <LoginModal
        isOpen={showAdminLogin}
        onClose={() => setShowAdminLogin(false)}
        title="เข้าสู่ระบบผู้ดูแล"
        buttonColor="red"
        onLogin={(u, p) => handleLogin(u, p, Role.ADMIN)}
      />

      <LoginModal
        isOpen={showTeacherLogin}
        onClose={() => setShowTeacherLogin(false)}
        title="เข้าสู่ระบบครู"
        buttonColor="green"
        onLogin={(u, p) => handleLogin(u, p, Role.TEACHER)}
      />

      {/* Mobile Bottom Navigation - Hidden when Admin/Teacher have their own nav */}
      {view !== 'admin' && view !== 'teacher' && (
        <BottomNav
          currentView={view}
          onNavigate={(newView) => setView(newView)}
          isLoggedIn={!!currentUser}
          userRole={currentUser?.role === Role.ADMIN ? 'admin' : currentUser?.role === Role.TEACHER ? 'teacher' : null}
        />
      )}

      <footer className="bg-white border-t py-6 mt-auto no-print hidden md:block">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} โรงเรียนประชาสามัคคี. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default App;
