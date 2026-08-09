import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const SECTIONS = [
  {
    id: 'overview',
    title: '1. Overview',
    content: `This Refund & Cancellation Policy governs subscription cancellations, refund requests, and billing for the FlacronAI platform ("Service"). By subscribing to a paid plan, you agree to the terms outlined here.

For questions about billing or to request a cancellation, contact support@flacronenterprises.com.`,
  },
  {
    id: 'subscription-model',
    title: '2. Subscription Model',
    content: `Billing cycles:
Paid subscriptions are billed on a recurring basis — monthly or annually, depending on the plan you selected. Billing occurs on the same day each cycle (the anniversary of your initial subscription date).

Automatic renewal:
Subscriptions renew automatically at the end of each billing period unless you cancel before the renewal date. You will not receive a reminder before each renewal.

Plan changes:
You may upgrade your plan at any time. The new plan takes effect immediately, and you are charged a prorated amount for the remainder of the current billing cycle. Downgrades take effect at the start of the next billing cycle — you retain access to the higher-tier features until then.`,
  },
  {
    id: 'cancellation',
    title: '3. Cancellation',
    content: `How to cancel:
You may cancel your subscription at any time from your account settings (Dashboard → Billing → Cancel Subscription) or by contacting support@flacronenterprises.com.

Effect of cancellation:
Cancellation stops future billing but does not refund the current billing period. You retain access to paid features until the end of the period you have already paid for. After that date, your account reverts to the free Starter plan.

No penalties:
There are no cancellation fees. You may cancel at any time without penalty.

Reactivation:
You may reactivate a canceled subscription at any time by selecting a paid plan from the Pricing page. Your previous data and reports remain accessible.`,
  },
  {
    id: 'refund-policy',
    title: '4. Refund Policy',
    content: `General rule — no refunds for current billing period:
Subscription fees are non-refundable. When you cancel, you retain access through the end of your current paid period, but no prorated refund is issued for unused time.

Exceptions — refunds at our discretion:
We may issue a refund in the following cases, evaluated on a case-by-case basis:
- Service outage: If the Service was unavailable for an extended period (more than 48 consecutive hours) due to a platform failure on our end, and you were unable to use the Service during that time, we may issue a prorated refund for the affected period.
- Billing error: If you were charged incorrectly due to a technical error (duplicate charge, wrong plan amount, charge after cancellation), we will refund the incorrect amount.
- Accidental purchase: If you subscribed by mistake and contact us within 48 hours of the charge, before generating any reports, we may issue a full refund at our discretion.

How to request a refund:
Email support@flacronenterprises.com with:
- Your account email address.
- The charge date and amount.
- The reason for the refund request.
- Any supporting evidence (screenshots of errors, outage timestamps, etc.).

We will review your request and respond within 5 business days. Approved refunds are processed to the original payment method within 7-10 business days.

What is never refundable:
- Subscription fees for time already used, even if you did not generate reports during that period.
- Fees for a plan downgrade (you retain access to the higher tier until the end of the paid period).
- Fees when you voluntarily cancel mid-cycle.
- Fees when your account is terminated for violating the Terms of Service or Acceptable Use Policy.`,
  },
  {
    id: 'payment-failures',
    title: '5. Payment Failures',
    content: `Failed payment:
If a recurring payment fails (expired card, insufficient funds, etc.), we will retry the charge up to three times over a 10-day period. You will receive email notifications after each failed attempt.

Grace period:
During the retry period, you retain access to your paid plan. If all retries fail, your subscription is automatically canceled and your account reverts to the free Starter plan.

Updating payment information:
You may update your payment method at any time from Dashboard → Billing → Update Payment Method. Updating your card does not trigger a new immediate charge — you are only charged on your regular billing date.

No debt collection:
If payment fails and your subscription is canceled, we do not pursue collection of the unpaid amount. Your account simply reverts to the free plan.`,
  },
  {
    id: 'free-trial',
    title: '6. Free Trial Terms',
    content: `[CLIENT TO CONFIRM: Does FlacronAI offer a free trial? If yes, specify duration, features, and billing behavior.]

If a free trial is offered:
- The trial period and included features are specified on the Pricing page at the time of signup.
- You may cancel at any time during the trial without being charged.
- If you do not cancel before the trial ends, your subscription begins and you are charged for the first billing cycle.
- Trials are limited to one per user and require a valid payment method on file.

If NO free trial is offered, this section is not applicable and can be removed.`,
  },
  {
    id: 'enterprise-plans',
    title: '7. Enterprise Plans',
    content: `Enterprise subscriptions may have custom terms governing cancellation, refunds, and billing. These terms are specified in your Enterprise Agreement and take precedence over this general Refund & Cancellation Policy.

For Enterprise billing questions, contact your account manager or enterprise@flacronenterprises.com.`,
  },
  {
    id: 'taxes',
    title: '8. Taxes',
    content: `All subscription prices are exclusive of applicable taxes. Depending on your billing address, sales tax, VAT, GST, or other transaction taxes may be added to your invoice.

Refunds, when issued, are for the subscription amount only. Taxes are refunded separately according to the rules of the tax authority in your jurisdiction.`,
  },
  {
    id: 'price-changes',
    title: '9. Price Changes',
    content: `We reserve the right to change subscription prices at any time. Price changes apply only to new subscriptions and renewals — not to your current billing cycle.

We will notify you by email at least 30 days before a price change affects your renewal. If you do not agree to the new price, you may cancel before your renewal date.`,
  },
  {
    id: 'contact',
    title: '10. Contact',
    content: `For billing questions, cancellation requests, or refund inquiries:

Email: support@flacronenterprises.com
Subject line: Include "Billing", "Cancellation", or "Refund Request"

We respond to billing inquiries within 1-2 business days.`,
  },
];

const RefundPolicy = () => {
  return (
    <div className="bg-bg min-h-screen">
      <Seo
        title="Refund & Cancellation Policy — FlacronAI"
        description="FlacronAI's refund and cancellation policy covering subscription billing, cancellation procedures, and refund eligibility."
        path="/refund-policy"
      />
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Refund & Cancellation Policy</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-border">
            <span>Last updated: <strong className="text-gray-600">March 1, 2026</strong></span>
            <span>•</span>
            <span>Effective: <strong className="text-gray-600">March 1, 2026</strong></span>
          </div>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.4 }}
                className="scroll-mt-20"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-4">{section.title}</h2>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-600 leading-relaxed whitespace-pre-line">{section.content}</p>
                </div>
              </motion.section>
            ))}
          </div>

          <div className="mt-12 p-6 bg-orange-50 border border-orange-200 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Important Notes</h3>
            <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
              <li>Subscriptions renew automatically unless canceled.</li>
              <li>Cancellation stops future billing but does not refund the current period.</li>
              <li>Refunds are issued only in exceptional cases at our discretion.</li>
              <li>Update your payment method before your renewal date to avoid service interruption.</li>
            </ul>
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default RefundPolicy;
