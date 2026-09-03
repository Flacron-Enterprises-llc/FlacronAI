import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Zap, ChevronDown, LogOut, Settings, Users, Search, Image as ImageIcon, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import TierBadge from './TierBadge.jsx';
import NotificationBell from './NotificationBell.jsx';

// Phase 20: a visible trigger for GlobalSearch (mounted once near the app
// root -- see App.jsx) since it can't be opened by CMD/CTRL+K discovery
// alone. Dispatches a DOM event rather than needing GlobalSearch's state
// lifted up through this unrelated layout component.
const openGlobalSearch = () => window.dispatchEvent(new CustomEvent('flacron:open-search'));

const ThemeToggle = ({ theme, toggleTheme, className = '' }) => (
  <button
    onClick={toggleTheme}
    className={`p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  >
    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
  </button>
);

const Navbar = ({
  transparent = false,
  mobileMenuLabel,
  mobileMenuItems = [],
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const userMenuRef = useRef(null);
  const { isAuthenticated, user, userProfile, logout, tier, emailVerified } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const isGoogleUser = user?.providerData?.some(p => p.providerId === 'google.com');
  // Navbar only ever mounts on public pages, or on a protected page after
  // ProtectedRoute has already let an unverified user through (i.e. never —
  // ProtectedRoute blocks rendering its children until verified/Google). So
  // reaching here with a live, unverified email/password session means the
  // user has left the dedicated verification screen (Auth.jsx / ProtectedRoute's
  // own gate) for a public page — force a real sign-out rather than just
  // hiding the account UI, so no page shows/keeps them signed in.
  const showAsSignedIn = isAuthenticated && (emailVerified || isGoogleUser);
  useEffect(() => {
    if (isAuthenticated && !emailVerified && !isGoogleUser) {
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, emailVerified, isGoogleUser]);

  const handleHashClick = (e, href) => {
    const hash = href.replace('/#', '');
    e.preventDefault();
    if (location.pathname === '/') {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/', { state: { scrollTo: hash } });
    }
  };

  const handleLogoClick = (e) => {
    if (location.pathname === '/') {
      e.preventDefault();
      setMobileOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll progress bar: rAF-throttled so it costs at most one layout read
  // per frame, recomputed on resize, and reset/re-measured on every route
  // change (new page can be a different, possibly non-scrollable, height).
  useEffect(() => {
    let ticking = false;
    const updateProgress = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      setScrollProgress(scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0);
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateProgress);
      }
    };
    updateProgress();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [location.pathname]);

  useEffect(() => setMobileOpen(false), [location]);
  useEffect(() => setUserMenuOpen(false), [location]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinks = [
    { label: 'Features', href: '/features' },
    { label: 'Solutions', href: '/solutions' },
    { label: 'Pricing', href: '/pricing' },
    ...(showAsSignedIn ? [{ label: 'Dashboard', href: '/dashboard' }] : []),
    ...(showAsSignedIn && (tier === 'agency' || tier === 'enterprise')
      ? [{ label: 'CRM', href: '/crm' }]
      : []),
  ];

  const solid = scrolled || !transparent;
  const bgClass = solid
    ? 'bg-bg/95 backdrop-blur-md border-b border-gray-200 shadow-lg shadow-black/20'
    : 'bg-transparent';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${bgClass}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2.5 group">
            <span className={`flex items-center justify-center h-9 rounded-md ${solid ? 'bg-white px-1.5 py-1' : ''}`}>
              <img src="/new-logo.png" alt="FlacronAI logo" className="h-full w-auto object-contain" />
            </span>
            <span className="font-bold text-lg text-gray-900 tracking-tight">FlacronAI</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(link =>
              link.href.startsWith('/#') ? (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleHashClick(e, link.href)}
                  className="text-sm text-brand-500 hover:text-brand-600 transition-colors font-medium cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.href}
                  className={`text-sm transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                    (link.href === '/crm' || link.href === '/solutions'
                      ? location.pathname.startsWith(link.href)
                      : location.pathname === link.href)
                      ? 'font-semibold text-brand-600 underline underline-offset-4 decoration-2'
                      : 'font-medium text-brand-500 hover:text-brand-600'
                  }`}
                >
                  {link.label}
                </Link>
              )
            )}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            {showAsSignedIn ? (
              <>
                <button
                  onClick={openGlobalSearch}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors text-sm"
                  aria-label="Search (Ctrl+K)"
                  title="Search (Ctrl+K)"
                >
                  <Search className="w-4 h-4" />
                  <kbd className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-400">
                    ⌘K
                  </kbd>
                </button>
                <NotificationBell />
              </>
            ) : null}
            {showAsSignedIn ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(p => !p)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center text-sm font-bold text-brand-500">
                    {(userProfile?.displayName || user?.email || 'U')[0].toUpperCase()}
                  </div>
                  <TierBadge tier={tier} />
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-bg border border-gray-200 rounded-xl shadow-xl shadow-black/10 overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-900 truncate">{userProfile?.displayName || 'My Account'}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      </div>
                      <div className="py-1">
                        <Link to="/dashboard" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <Zap className="w-4 h-4 text-brand-500" />
                          Dashboard
                        </Link>
                        <Link to="/photos" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <ImageIcon className="w-4 h-4 text-brand-500" />
                          Photo Library
                        </Link>
                        {(tier === 'agency' || tier === 'enterprise') && (
                          <Link to="/crm" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                            <Users className="w-4 h-4 text-brand-500" />
                            CRM
                          </Link>
                        )}
                        <Link to="/settings" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <Settings className="w-4 h-4 text-gray-400" />
                          Settings
                        </Link>
                      </div>
                      <div className="border-t border-gray-200 py-1">
                        <button
                          onClick={() => { setUserMenuOpen(false); logout(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <>
                <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium">Sign in</Link>
                <Link to="/signup" className="btn-primary text-sm py-2 px-5">Get Started Free</Link>
              </>
            )}
          </div>

          {/* Mobile: search + notifications stay reachable without opening the menu */}
          <div className="flex md:hidden items-center gap-1">
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} className="p-2" />
            {showAsSignedIn && (
              <>
                <button
                  onClick={openGlobalSearch}
                  className="p-2 text-gray-600 hover:text-gray-900"
                  aria-label="Search"
                  title="Search"
                >
                  <Search className="w-5 h-5" />
                </button>
                <NotificationBell />
              </>
            )}
            <button
              className="p-2 text-gray-600 hover:text-gray-900"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              title={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-surface border-t border-gray-200"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map(link =>
                link.href.startsWith('/#') ? (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={(e) => handleHashClick(e, link.href)}
                    className="block px-3 py-2.5 text-brand-500 hover:text-brand-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    to={link.href}
                    className={`block px-3 py-2.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                      (link.href === '/crm' || link.href === '/solutions'
                      ? location.pathname.startsWith(link.href)
                      : location.pathname === link.href)
                        ? 'font-semibold text-brand-600 bg-brand-50'
                        : 'font-medium text-brand-500 hover:text-brand-600 hover:bg-gray-100'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              )}
              {mobileMenuItems.length > 0 && (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  {mobileMenuLabel && (
                    <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                      {mobileMenuLabel}
                    </p>
                  )}
                  <div className="space-y-1">
                    {mobileMenuItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          item.onSelect();
                          setMobileOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          item.active
                            ? 'bg-brand-50 font-semibold text-brand-600'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-3 border-t border-gray-200 space-y-1">
                {showAsSignedIn ? (
                  <>
                    <div className="px-3 py-2 mb-1">
                      <p className="text-xs font-semibold text-gray-900 truncate">{userProfile?.displayName || 'My Account'}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                    </div>
                    <Link to="/dashboard" className="block px-3 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">Dashboard</Link>
                    <Link to="/photos" className="block px-3 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">Photo Library</Link>
                    <Link to="/settings" className="block px-3 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">Settings</Link>
                    <button
                      onClick={logout}
                      className="w-full text-left px-3 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="block text-center py-2.5 text-gray-600 hover:text-gray-900">Sign in</Link>
                    <Link to="/signup" className="block btn-primary text-center">Get Started Free</Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll progress bar */}
      <div
        className="absolute bottom-0 left-0 h-[3px] bg-brand-500 transition-[width] duration-150 ease-out pointer-events-none"
        style={{ width: `${scrollProgress}%` }}
        role="progressbar"
        aria-hidden="true"
      />
    </nav>
  );
};

export default Navbar;
