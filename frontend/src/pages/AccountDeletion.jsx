import { Link } from 'react-router-dom';
import { Trash2, Smartphone, Monitor, Mail, CreditCard } from 'lucide-react';
import Navbar from '../components/Navbar.jsx';
import Footer from '../components/Footer.jsx';
import Seo from '../components/Seo.jsx';
import { DELETED_DATA, RETAINED_DATA, SUBSCRIPTION_WARNING, SUPPORT_EMAIL } from '../utils/accountDeletion.js';

// Mobile Phase 10: public "how to delete your FlacronAI account" page -- the URL the
// App Store / Google Play listings point to. Information only: there is no form and
// no account lookup, so it can't delete anything or reveal whether an account
// exists. Actual deletion always goes through the signed-in, re-verified flow
// (app Settings, or web Settings → Security), backed by DELETE /users/account.
const Section = ({ icon: Icon, title, children }) => (
  <section className="card p-6">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-9 h-9 bg-brand-500/10 border border-brand-200 rounded-xl flex items-center justify-center">
        <Icon className="w-4 h-4 text-brand-500" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </div>
    <div className="text-gray-600 text-sm space-y-2">{children}</div>
  </section>
);

const List = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1">
    {items.map((i) => <li key={i}>{i}</li>)}
  </ul>
);

export default function AccountDeletion() {
  return (
    <div className="min-h-screen bg-bg">
      <Seo
        title="Delete Your Account — FlacronAI"
        description="How to delete your FlacronAI account in the app or on the website, what is deleted, what is kept, and what happens to subscriptions."
        path="/account-deletion"
      />
      <Navbar />

      <div className="pt-24 pb-10 bg-surface border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 mb-3">Delete your FlacronAI account</h1>
          <p className="text-gray-500 text-lg">
            You can delete your account and its data yourself at any time, in the FlacronAI app or on this website.
            Deletion is permanent and cannot be undone.
          </p>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <Section icon={Smartphone} title="In the FlacronAI app (iPhone, iPad, Android)">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Sign in and open <strong>Settings</strong>.</li>
            <li>Tap <strong>Delete account</strong>.</li>
            <li>Confirm it&apos;s you (password, Google or Apple sign-in) and type DELETE.</li>
          </ol>
        </Section>

        <Section icon={Monitor} title="On the website">
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Sign in and go to <Link to="/settings?tab=security" className="text-brand-600 underline">Settings → Security</Link>.
            </li>
            <li>Choose <strong>Delete Account</strong>.</li>
            <li>Confirm with your password, or with Google or Apple if you sign in that way, and type DELETE.</li>
          </ol>
        </Section>

        <Section icon={Trash2} title="What is deleted">
          <List items={DELETED_DATA} />
        </Section>

        <Section icon={Trash2} title="What is kept">
          <List items={RETAINED_DATA} />
          <p>
            How long billing records are kept is described in Section 5 (Data Retention) of our{' '}
            <Link to="/privacy-policy" className="text-brand-600 underline">Privacy Policy</Link>. Deleted accounts
            cannot be recovered.
          </p>
        </Section>

        <Section icon={CreditCard} title="Subscriptions">
          <p>{SUBSCRIPTION_WARNING}</p>
        </Section>

        <Section icon={Mail} title="Can't sign in?">
          <p>
            Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Privacy%20Request`} className="text-brand-600 underline">{SUPPORT_EMAIL}</a>{' '}
            from the address on your account, with the subject &quot;Privacy Request&quot;. Identity verification may be required
            before we act on a request, as described in our Privacy Policy.
          </p>
        </Section>
      </main>

      <Footer />
    </div>
  );
}
