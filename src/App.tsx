import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  // Firebase Realtime Database helpers
  ref,
  push,
  set,
  update,
  remove,
  onValue
} from './firebase';
import { Contact } from './types';
import { logError, friendlyMessage } from './firebaseError';
import {
  ShieldCheck,
  Search,
  Plus,
  LogOut,
  Phone,
  Mail,
  Download,
  Trash2,
  Edit3,
  User,
  Lock,
  X,
  FileText,
  Eye,
  EyeOff,
  Users,
  Briefcase,
  Heart,
  UserCircle,
  Sun,
  Moon,
  Upload,
  KeyRound
} from 'lucide-react';

// jsPDF types (loaded via CDN in index.html)
declare const window: any;

// Contact Picker API shape (not yet in TypeScript DOM lib)
interface ContactPickerContact {
  name?: string[];
  tel?: string[];
  email?: string[];
}
interface NavigatorWithContacts extends Navigator {
  contacts?: {
    select: (properties: string[], options?: { multiple?: boolean }) => Promise<ContactPickerContact[]>;
  };
}

const isContactPickerSupported =
  typeof navigator !== 'undefined' &&
  'contacts' in navigator &&
  typeof (navigator as NavigatorWithContacts).contacts?.select === 'function';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Theme state — defaults to dark, persisted in localStorage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('contact-vault-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('contact-vault-theme', theme);
  }, [theme]);

  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [firstNameInput, setFirstNameInput] = useState('');
  const [lastNameInput, setLastNameInput] = useState('');
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password reset state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetError, setResetError] = useState('');

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [contactsLoading, setContactsLoading] = useState(false);
  // Secure generic banner for subscription/fetch failures (never shows raw Firebase errors)
  const [listError, setListError] = useState('');
  // Import (Contact Picker) notice banner
  const [importNotice, setImportNotice] = useState('');

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    category: 'Work' as 'Family' | 'Work' | 'Friends' | 'Other',
    notes: ''
  });

  // Listen for Auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen for Realtime Database contacts at: contacts/${uid}
  useEffect(() => {
    if (!auth.currentUser) {
      setContacts([]);
      setListError('');
      return;
    }

    const uid = auth.currentUser.uid;
    setContactsLoading(true);

    // Path matches security rules: contacts/$userId
    const contactsRef = ref(db, `contacts/${uid}`);

    const unsubscribe = onValue(contactsRef, (snapshot) => {
      const data = snapshot.val();
      const fetched: Contact[] = [];

      if (data) {
        Object.keys(data).forEach((key) => {
          // Skip the hidden profile node — it is not a contact
          if (key === '_profile') return;
          fetched.push({ id: key, ...data[key] } as Contact);
        });
      }

      fetched.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setContacts(fetched);
      setContactsLoading(false);
      setListError('');
    }, (error) => {
      // Raw error goes to console only; UI gets a generic safe message
      logError('contacts-listener', error);
      setContactsLoading(false);
      setListError(friendlyMessage(error));
    });

    return () => unsubscribe();
  }, [currentUser]);

  const resetAuthForm = () => {
    setEmailInput('');
    setPasswordInput('');
    setConfirmPasswordInput('');
    setFirstNameInput('');
    setLastNameInput('');
    setPhoneNumberInput('');
    setAuthError('');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signup') {
      if (passwordInput !== confirmPasswordInput) {
        setAuthError('Passwords do not match. Please re-enter them.');
        return;
      }
      if (passwordInput.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        return;
      }
    }

    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, emailInput, passwordInput);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
        // Save the user's profile under their own partition, per the rules.
        // A profile-write failure must NOT break a successfully created account.
        if (auth.currentUser) {
          try {
            await set(ref(db, `contacts/${cred.user.uid}/_profile`), {
              firstName: firstNameInput.trim(),
              lastName: lastNameInput.trim(),
              phoneNumber: phoneNumberInput.trim(),
              email: emailInput,
              createdAt: Date.now()
            });
          } catch (profileErr) {
            logError('signup-profile-write', profileErr);
          }
        }
      }
      resetAuthForm();
    } catch (err: unknown) {
      // Raw Firebase auth error -> console only; UI gets friendly text
      logError('auth-submit', err);
      setAuthError(friendlyMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  // ---- Step 1: Forgot Password ----
  const openResetModal = () => {
    setResetEmail(emailInput); // pre-fill with whatever they typed
    setResetSuccess('');
    setResetError('');
    setIsResetModalOpen(true);
  };

  const closeResetModal = () => {
    setIsResetModalOpen(false);
    setResetLoading(false);
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');

    if (!resetEmail.trim()) {
      setResetError('Please enter your email address.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetSuccess('Password reset email sent. Check your inbox (and spam folder).');
    } catch (err: unknown) {
      logError('password-reset', err);
      setResetError(friendlyMessage(err));
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogout = () => {
    try {
      signOut(auth).catch((err: unknown) => logError('logout', err));
    } catch (err) {
      logError('logout', err);
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || savingContact) return;

    const uid = auth.currentUser.uid;
    setSavingContact(true);
    try {
      if (editingId) {
        // Update existing: contacts/${uid}/${contactId}
        await update(ref(db, `contacts/${uid}/${editingId}`), {
          ...formData,
          updatedAt: Date.now()
        });
      } else {
        // Create new: push() generates an ID under contacts/${uid}
        const newContactRef = push(ref(db, `contacts/${uid}`));
        await set(newContactRef, {
          ...formData,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      // ONLY close the modal after the database has confirmed the write.
      closeModal();
    } catch (err: unknown) {
      logError('save-contact', err);
      alert(friendlyMessage(err));
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    if (!auth.currentUser) return;

    if (confirm("Are you sure you want to delete this contact?")) {
      try {
        // Delete: contacts/${uid}/${contactId}
        await remove(ref(db, `contacts/${auth.currentUser.uid}/${id}`));
      } catch (err: unknown) {
        logError('delete-contact', err);
        alert(friendlyMessage(err));
      }
    }
  };

  // ---- Step 3: Bulk import via Contact Picker API ----
  const handleImportContacts = async () => {
    if (!auth.currentUser) return;

    // Desktop fallback — never block laptop users
    if (!isContactPickerSupported) {
      setImportNotice('Contact import is only available on supported mobile browsers (Chrome on Android). On desktop, please use the "Add Contact" form instead.');
      return;
    }

    try {
      const selected = await (navigator as NavigatorWithContacts).contacts!.select(
        ['name', 'tel', 'email'],
        { multiple: true }
      );

      if (!selected || selected.length === 0) return; // user cancelled

      const uid = auth.currentUser.uid;
      let imported = 0;

      // Map phone contacts into the EXACT same structure the manual form uses,
      // then write to the same contacts/${uid} partition. onValue feeds them
      // into the same state array + UI cards as manual contacts.
      for (const c of selected) {
        const mapped = {
          name: (c.name && c.name[0]) || 'Unnamed Contact',
          phone: (c.tel && c.tel[0]) || '',
          email: (c.email && c.email[0]) || '',
          category: 'Other' as 'Family' | 'Work' | 'Friends' | 'Other',
          notes: 'Imported from device contacts'
        };
        await set(push(ref(db, `contacts/${uid}`)), {
          ...mapped,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        imported++;
      }

      setImportNotice(`Successfully imported ${imported} contact${imported === 1 ? '' : 's'} from your device.`);
    } catch (err: unknown) {
      // User cancelling the picker throws — don't treat it as a scary failure
      const code = (err as { code?: string })?.code;
      if (code === 'AbortError' || code === 'NotAllowedError') {
        setImportNotice('Import cancelled.');
        return;
      }
      logError('import-contacts', err);
      setImportNotice(friendlyMessage(err));
    }
  };

  const openModal = (contact?: Contact) => {
    if (contact) {
      setEditingId(contact.id);
      setFormData({
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        category: contact.category,
        notes: contact.notes
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', phone: '', email: '', category: 'Work', notes: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };


  // Export VCF / vCard
  const exportVCard = () => {
    try {
      let vcfContent = "";
      contacts.forEach(c => {
        vcfContent += "BEGIN:VCARD\nVERSION:3.0\n";
        vcfContent += `FN:${c.name}\n`;
        if (c.phone) vcfContent += `TEL;TYPE=CELL:${c.phone}\n`;
        if (c.email) vcfContent += `EMAIL:${c.email}\n`;
        if (c.notes) vcfContent += `NOTE:${c.notes}\n`;
        vcfContent += "END:VCARD\n";
      });

      const blob = new Blob([vcfContent], { type: "text/vcard;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'contacts_export.vcf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      logError('export-vcard', err);
      alert('An unexpected error occurred. Please try again.');
    }
  };

  // Export PDF — full contact details with owner name in the header
 const exportPDF = () => {
  try {
    // 1. Initialize document instance
    const docPdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const pageWidth = docPdf.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    // ---- Header: owner identity ----
    docPdf.setFillColor(15, 23, 42); // slate-900
    docPdf.rect(0, 0, pageWidth, 90, 'F');

    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(20);
    docPdf.text('Contact Vault', margin, y + 10);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(11);
    docPdf.setTextColor(165, 180, 252); // indigo-300
    docPdf.text(`Owner: ${currentUser?.email || 'Unknown'}`, margin, y + 32);
    docPdf.text(
      `Exported: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      margin, y + 48
    );

    docPdf.setTextColor(148, 163, 184); // slate-400
    docPdf.setFontSize(10);
    docPdf.text(`Total contacts: ${contacts.length}`, pageWidth - margin, y + 32, { align: 'right' });

    // ---- Table: full contact details ----
    const tableColumn = ['#', 'Name', 'Category', 'Phone', 'Email', 'Notes'];
    const tableRows = filteredContacts.map((c, i) => [
      String(i + 1),
      c.name,
      c.category,
      c.phone || '-',
      c.email || '-',
      c.notes || '-'
    ]);

    // 2. Call autoTable safely using the functional import (Bypasses prototype errors)
    autoTable(docPdf, {
      head: [tableColumn],
      body: tableRows,
      startY: 110,
      margin: { left: margin, right: margin },
      styles: {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 6,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [79, 70, 229], // indigo-600
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 120, fontStyle: 'bold' },
        2: { cellWidth: 70 },
        3: { cellWidth: 110 },
        4: { cellWidth: 160 },
        5: { cellWidth: 'auto' }
      },
      didDrawPage: (_data: any) => {
        // Footer with page number safely calculated
        const pageCount = (docPdf as any).getNumberOfPages ? (docPdf as any).getNumberOfPages() : docPdf.internal.pages.length - 1;
        const currentPage = (docPdf as any).getCurrentPageInfo ? (docPdf as any).getCurrentPageInfo().pageNumber : 1;

        docPdf.setFontSize(8);
        docPdf.setTextColor(148, 163, 184);
        docPdf.text(
          `Page ${currentPage} of ${pageCount}   •   Contact Vault   •   ${currentUser?.email || ''}`,
          pageWidth / 2,
          docPdf.internal.pageSize.getHeight() - 20,
          { align: 'center' }
        );
      }
    });

    const safeName = (currentUser?.email || 'user').split('@')[0].replace(/[^a-z0-9]/gi, '_');
    docPdf.save(`contacts_${safeName}.pdf`);
  } catch (err: unknown) {
    console.error('export-pdf error:', err);
    alert('An unexpected error occurred. Please try again.');
  }
};

  // Filter contacts
  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.phone || '').includes(searchQuery) ||
                          (c.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Per-individual dashboard
  const categoryStats = [
    { key: 'All', label: 'All Contacts', count: contacts.length, icon: Users, color: 'text-indigo-400 bg-indigo-600/10 border-indigo-500/30' },
    { key: 'Family', label: 'Family', count: contacts.filter(c => c.category === 'Family').length, icon: Heart, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
    { key: 'Work', label: 'Work', count: contacts.filter(c => c.category === 'Work').length, icon: Briefcase, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
    { key: 'Friends', label: 'Friends', count: contacts.filter(c => c.category === 'Friends').length, icon: UserCircle, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { key: 'Other', label: 'Other', count: contacts.filter(c => c.category === 'Other').length, icon: Search, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col justify-center items-center px-4 py-10">
        <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-indigo-600/20 p-4 rounded-full border border-indigo-500/30 text-indigo-400 mb-3">
              <ShieldCheck size={36} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Contact Vault</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 text-center">Secure partitioned Web Contacts Cloud</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-lg">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">First Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input
                        type="text"
                        required
                        value={firstNameInput}
                        onChange={(e) => setFirstNameInput(e.target.value)}
                        placeholder="John"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-3 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Surname</label>
                    <input
                      type="text"
                      required
                      value={lastNameInput}
                      onChange={(e) => setLastNameInput(e.target.value)}
                      placeholder="Doe"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="tel"
                      required
                      value={phoneNumberInput}
                      onChange={(e) => setPhoneNumberInput(e.target.value)}
                      placeholder="+1 555 000 1234"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Email</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-11 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-3 text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {authMode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full bg-white dark:bg-slate-900 border rounded-lg pl-10 pr-11 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition-colors ${
                      confirmPasswordInput && confirmPasswordInput !== passwordInput
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-slate-300 dark:border-slate-700 focus:border-indigo-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-3 top-3 text-slate-400 hover:text-indigo-400 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmPasswordInput && confirmPasswordInput !== passwordInput && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors shadow-lg shadow-indigo-600/30 mt-2 flex items-center justify-center space-x-2"
            >
              {authLoading && (
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
              )}
              <span>
                {authLoading
                  ? (authMode === 'login' ? 'Logging in...' : 'Creating account...')
                  : (authMode === 'login' ? 'Sign In' : 'Create Account')}
              </span>
            </button>
          </form>

          {/* Step 1: Forgot password link (login mode only) */}
          {authMode === 'login' && (
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={openResetModal}
                className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {authMode === 'login' ? (
              <p>Don\'t have an account? <button onClick={() => { setAuthMode('signup'); setAuthError(''); }} className="text-indigo-500 dark:text-indigo-400 hover:underline">Sign up</button></p>
            ) : (
              <p>Already have an account? <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-indigo-500 dark:text-indigo-400 hover:underline">Log in</button></p>
            )}
          </div>
        </div>

        {/* Step 1: Password Reset Modal */}
        {isResetModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !resetLoading && closeResetModal()}
          >
            <div
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeResetModal}
                disabled={resetLoading}
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={20} />
              </button>
              <div className="flex items-center space-x-3 mb-2">
                <div className="bg-indigo-600/20 p-2.5 rounded-xl text-indigo-400 border border-indigo-500/30">
                  <KeyRound size={20} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Reset Password</h2>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                Enter your account email and we will send you a link to reset your password.
              </p>

              {resetSuccess && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm rounded-lg">
                  {resetSuccess}
                </div>
              )}
              {resetError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-lg">
                  {resetError}
                </div>
              )}

              <form onSubmit={handleSendReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Email</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    disabled={resetLoading}
                    className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition flex items-center space-x-2"
                  >
                    {resetLoading && (
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                    )}
                    <span>{resetLoading ? 'Sending...' : 'Send Reset Link'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100 pb-12">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 sticky top-0 z-10 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600/20 p-2 rounded-xl text-indigo-400 border border-indigo-500/30">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900 dark:text-white">Contact Vault</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser.email}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Step 2: Theme toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-9 h-9 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={exportPDF}
              title="Export PDF"
              className="flex items-center space-x-1 text-xs bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-500 dark:text-indigo-300 px-3 py-2 rounded-lg border border-indigo-500/30 transition"
            >
              <FileText size={14} />
              <span className="hidden md:inline">PDF</span>
            </button>
            <button
              onClick={exportVCard}
              title="Export vCard"
              className="flex items-center space-x-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 transition"
            >
              <Download size={14} />
              <span className="hidden md:inline">.VCF</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/30 px-3 py-2 rounded-lg transition"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">

        {/* Secure generic error banner — only ever shows friendly messages */}
        {listError && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm rounded-lg flex items-center justify-between">
            <span>{listError}</span>
            <button
              onClick={() => setListError('')}
              className="text-red-400/70 hover:text-red-300 p-1"
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Import notice banner (success / desktop fallback / cancellation) */}
        {importNotice && (
          <div className="mb-6 p-3 bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-sm rounded-lg flex items-center justify-between">
            <span>{importNotice}</span>
            <button
              onClick={() => setImportNotice('')}
              className="text-indigo-400/70 hover:text-indigo-300 p-1"
              aria-label="Dismiss notice"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Personal Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {categoryStats.map(stat => (
            <button
              key={stat.key}
              onClick={() => setActiveCategory(stat.key)}
              className={`flex items-center space-x-3 p-4 rounded-2xl border text-left transition ${
                activeCategory === stat.key
                  ? 'border-indigo-500 bg-indigo-600/20 ring-1 ring-indigo-500/40'
                  : `border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 ${stat.color.split(' ').slice(1).join(' ')}`
              }`}
            >
              <stat.icon size={20} className={stat.color.split(' ')[0]} />
              <div>
                <p className="text-xl font-bold text-slate-900 dark:text-white leading-none">{stat.count}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex space-x-1 bg-white dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-x-auto">
              {['All', 'Family', 'Work', 'Friends', 'Other'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    activeCategory === cat ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Step 3: Import Phone Contacts — desktop users get a friendly pointer to the manual form */}
            <button
              onClick={handleImportContacts}
              disabled={!isContactPickerSupported}
              title={isContactPickerSupported
                ? 'Import contacts from your device (supported mobile browsers)'
                : 'Contact import needs a supported mobile browser — use "Add Contact" instead'}
              className={`flex items-center space-x-1.5 text-sm font-medium px-4 py-2.5 rounded-xl transition whitespace-nowrap border ${
                isContactPickerSupported
                  ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  : 'bg-slate-100/60 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700/60 cursor-not-allowed'
              }`}
            >
              <Upload size={18} />
              <span>Import Phone Contacts</span>
            </button>

            <button
              onClick={() => openModal()}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-600/20 whitespace-nowrap"
            >
              <Plus size={18} />
              <span>Add Contact</span>
            </button>
          </div>
        </div>

        {/* Contacts Grid */}
        {contactsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-500 dark:text-slate-400">No contacts found in your vault.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContacts.map(contact => (
              <div key={contact.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 hover:border-slate-300 dark:hover:border-slate-600 transition flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white uppercase">
                        {contact.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white leading-tight">{contact.name}</h3>
                        <span className="inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700/80 text-indigo-600 dark:text-indigo-300">
                          {contact.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button onClick={() => openModal(contact)} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => handleDeleteContact(contact.id)} className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 mt-4 text-sm text-slate-600 dark:text-slate-300">
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400 hover:underline">
                        <Phone size={15} />
                        <span>{contact.phone}</span>
                      </a>
                    )}
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="flex items-center space-x-2 text-slate-600 dark:text-slate-300 hover:underline truncate">
                        <Mail size={15} />
                        <span className="truncate">{contact.email}</span>
                      </a>
                    )}
                    {contact.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/40 line-clamp-2">
                        {contact.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Form */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !savingContact && closeModal()}
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              disabled={savingContact}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              {editingId ? 'Edit Contact' : 'New Contact'}
            </h2>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  disabled={savingContact}
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Phone Number</label>
                  <input
                    type="tel"
                    disabled={savingContact}
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Category</label>
                  <select
                    value={formData.category}
                    disabled={savingContact}
                    onChange={e => setFormData({...formData, category: e.target.value as any})}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value="Family">Family</option>
                    <option value="Work">Work</option>
                    <option value="Friends">Friends</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  disabled={savingContact}
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-300 uppercase mb-1">Notes</label>
                <textarea
                  rows={3}
                  disabled={savingContact}
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={savingContact}
                  className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingContact}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition flex items-center space-x-2"
                >
                  {savingContact && (
                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                  )}
                  <span>
                    {savingContact
                      ? (editingId ? 'Saving...' : 'Creating...')
                      : (editingId ? 'Save Changes' : 'Create Contact')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}