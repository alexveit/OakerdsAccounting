// src/PrivacyPolicy.tsx
// Privacy Policy page for Oakerds Accounting

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 mb-8">Last updated: December 11, 2025</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Overview</h2>
          <p className="text-gray-700 leading-relaxed">
            Oakerds Accounting ("we," "our," or "us") is a private business management application 
            operated by Oakerds LLC. This application is designed for internal business use by 
            the owner and is not offered as a public service. This privacy policy explains how 
            we handle data within the application.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Information We Collect</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            This application collects and processes the following types of information:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>
              <strong>Financial Account Data:</strong> Bank account information, transaction 
              history, and balances accessed through Plaid Technologies, Inc.
            </li>
            <li>
              <strong>Business Records:</strong> Job information, customer details, vendor 
              information, expenses, and income records entered directly into the application.
            </li>
            <li>
              <strong>Authentication Data:</strong> Login credentials and session information 
              required to secure access to the application.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">How We Use Information</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Information collected is used exclusively for:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>Business accounting and financial management</li>
            <li>Job costing and profitability analysis</li>
            <li>Tax preparation and compliance</li>
            <li>Bank account reconciliation</li>
            <li>Business intelligence and reporting</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Third-Party Services</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            This application integrates with the following third-party services:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>
              <strong>Plaid Technologies, Inc.:</strong> Used to securely connect to financial 
              institutions and retrieve transaction data. Plaid's use of your data is governed 
              by their privacy policy at{' '}
              <a 
                href="https://plaid.com/legal/#end-user-privacy-policy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                https://plaid.com/legal
              </a>.
            </li>
            <li>
              <strong>Supabase:</strong> Provides secure database hosting and authentication 
              services with encryption at rest and in transit.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Storage and Security</h2>
          <p className="text-gray-700 leading-relaxed">
            All data is stored securely using industry-standard practices including:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-3">
            <li>Encryption in transit (TLS/HTTPS)</li>
            <li>Encryption at rest</li>
            <li>Multi-factor authentication on all administrative systems</li>
            <li>Row-level security policies restricting data access</li>
            <li>Regular security reviews and access audits</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Sharing</h2>
          <p className="text-gray-700 leading-relaxed">
            We do not sell, trade, or rent personal or financial information to third parties. 
            Data is only shared with the third-party service providers listed above as necessary 
            to operate the application, and with professional advisors (accountants, tax 
            preparers) as needed for business purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Retention</h2>
          <p className="text-gray-700 leading-relaxed">
            Financial records are retained in accordance with IRS record-keeping requirements 
            (generally 7 years for tax-related documents). Bank connection credentials through 
            Plaid may be disconnected at any time through the application.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Your Rights</h2>
          <p className="text-gray-700 leading-relaxed">
            As the owner and sole user of this application, you maintain full control over all 
            data, including the ability to access, export, modify, or delete any information 
            stored in the system.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact Information</h2>
          <p className="text-gray-700 leading-relaxed">
            For questions about this privacy policy or data practices, contact:
          </p>
          <p className="text-gray-700 mt-3">
            Oakerds LLC<br />
            Email: alex@oakerds.com
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Changes to This Policy</h2>
          <p className="text-gray-700 leading-relaxed">
            This privacy policy may be updated periodically. The "Last updated" date at the top 
            of this page indicates when the policy was last revised.
          </p>
        </section>

        <div className="border-t pt-6 mt-8">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Oakerds LLC. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
