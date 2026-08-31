import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

/**
 * Plain-English explanation of whatever tab you are looking at.
 *
 * Written for somebody who has never done accounting. No jargon, and where a
 * term is unavoidable -- gross profit, dilution, par value -- it is defined
 * in the sentence it appears in rather than assumed.
 */

type Section = { q: string; a: React.ReactNode };

const EXPLAIN: Record<string, { title: string; intro: string; sections: Section[] }> = {

  overview: {
    title: 'Money in & out',
    intro: 'Everything the company earned and everything it spent, for the dates you picked at the top.',
    sections: [
      { q: 'Money in',
        a: 'Every naira that reached you, from all six ways the app makes money: Plus subscriptions, gist adverts, event tickets, premium groups, store subscriptions and delivery commission.' },
      { q: 'Money out',
        a: 'Everything you spent and recorded on the Record tab. If a cost is not on this list, you have not entered it yet.' },
      { q: 'Profit',
        a: 'Money in minus money out. If it is red, you spent more than you earned in that period.' },
      { q: 'Margin',
        a: 'Out of every ₦100 that came in, how much you kept. 30% margin means ₦30 kept, ₦70 spent.' },
      { q: 'Company value',
        a: 'What you have said the company is worth. It is not calculated — you type it in on the Record tab, and it only changes when you change it.' },
      { q: 'Assets owned',
        a: 'Things you bought that you still have — a laptop, equipment. Money spent, but you got something back that you still own.' },
      { q: 'Owed to others',
        a: 'Money sitting in your account that is not yours. Group creators you pay on the 21st, vendor money, ticket organiser money. Spending this is spending other people’s cash.' },
      { q: 'Why is this different from the Gross profit tab?',
        a: 'This page counts everything. Gross profit follows a narrower rule set out in four people’s contracts — it ignores salaries, marketing and tax on purpose.' },
    ],
  },

  grossprofit: {
    title: 'Gross profit',
    intro: 'One number that decides what four people get paid this month. It has a legal definition and this app is named in their contracts as the place it is calculated.',
    sections: [
      { q: 'What it is, in one line',
        a: 'All the money you collected, minus only four specific costs. Nothing else comes off.' },
      { q: 'The four things that come off',
        a: (<>
          <strong>Gateway fees</strong> — what Paystack keeps.{' '}
          <strong>Seller share</strong> — money that was always the vendor’s.{' '}
          <strong>Direct infrastructure</strong> — hosting, database, storage.{' '}
          <strong>Refunds</strong> — money you gave back.
        </>) },
      { q: 'What does NOT come off',
        a: 'Salaries — including your own — marketing, office costs, professional fees, tax, equipment. That is deliberate. Taking them off would shrink the number and cut everyone’s pay, so the contract forbids it.' },
      { q: 'Why the streams are listed underneath',
        a: 'So you can check it. Divide a stream’s total by its payment count. If the average is not a price you would actually charge, something is being counted wrongly — that is exactly how the ticket error was caught.' },
      { q: '"Cash basis"',
        a: 'Money counts in the month it actually landed in your account, not the month you invoiced for it.' },
      { q: 'Certify',
        a: 'Locks the month. After that it cannot be edited — if it turns out wrong you record a correction, which saves a new version and keeps the old one visible. Both are kept for six years.' },
      { q: 'Band',
        a: 'Which pay level this month reaches. Band 1 is the lowest and pays nothing; Band 5 is full salary. See the Payroll tab.' },
    ],
  },

  payroll: {
    title: 'Payroll',
    intro: 'What everyone gets paid this month, worked out from the gross profit figure.',
    sections: [
      { q: 'How pay is decided',
        a: 'Not a fixed salary. It steps up with gross profit. Under ₦1.5m nobody gets cash. Over ₦7m everybody gets their full salary. Four steps in between.' },
      { q: 'Bands',
        a: 'Band 1 under ₦1.5m · Band 2 from ₦1.5m · Band 3 from ₦3m · Band 4 from ₦4.5m · Band 5 from ₦7m. Each month stands alone — a good month does not carry over to the next.' },
      { q: 'Accrued',
        a: 'When somebody is not paid in full, HALF of what is missing is written down as owed to them later. The other half is gone permanently and is never owed.' },
      { q: 'The cap',
        a: 'Officers stop building up debt at ₦1m each, you at ₦1.5m. After that, shortfalls do not accrue at all.' },
      { q: 'When the debt gets paid',
        a: 'Three months in a row at Band 5, or you raise ₦150m or more, or the company is sold. Whichever comes first.' },
      { q: 'Why you are paid last',
        a: 'Your contract says so. The app blocks marking your own pay as paid while any officer is still owed for that month.' },
      { q: 'Due date',
        a: 'The 10th of the following month. Anything unpaid after that shows as overdue.' },
    ],
  },

  captable: {
    title: 'Ownership',
    intro: 'Who owns the company, right now.',
    sections: [
      { q: 'Shares',
        a: 'The company is cut into 1,000,000 pieces. Owning 100,000 of them means owning 10% of the company.' },
      { q: 'Why "Owns" and "Votes" are different numbers',
        a: 'There are two kinds of share. Class A gets ten votes each, Class B gets one. You hold 800,000 Class A — that is 80% of the company but about 97.5% of the voting power.' },
      { q: 'Why that matters',
        a: 'It means you keep control of decisions even if you sell part of the company. That is the whole reason the company was set up with two share classes.' },
      { q: 'Par value (₦10)',
        a: 'The legal minimum price a share was issued at. It is not what a share is worth — it is what was originally paid in.' },
    ],
  },

  milestones: {
    title: 'Milestones',
    intro: 'Shares four people can earn by hitting targets. None have been earned yet.',
    sections: [
      { q: 'Transfer vs new issue — the important one',
        a: (<>
          <strong>Transfer</strong> means shares move from you to them. The company still has 1,000,000 shares and nothing needs filing.{' '}
          <strong>New issue</strong> means brand-new shares are created. The total goes up, everyone else’s slice gets smaller, and you have to file at CAC.
        </>) },
      { q: 'Challenges',
        a: 'A task with shares attached. It is offered, they accept or decline within five working days, then they either deliver it or they do not.' },
      { q: 'Lapsed',
        a: 'Shares from a challenge that was declined or failed. They are gone permanently — they do not go back into the pot.' },
      { q: 'Default award',
        a: 'Whatever shares were never attached to any challenge get handed over automatically at the deadline. Note it subtracts every challenge ever offered, including declined ones — so declining a challenge loses those shares twice.' },
      { q: 'Your own five tranches',
        a: 'Five blocks of 10,000 Class A shares. Each needs a target written down before 30 September 2026, and each must be signed off by a director who is not you. Miss either and that block is gone.' },
      { q: 'The three views',
        a: '"Current" is what is registered today. "If everything vests" is the worst case for your ownership. "Scenario" lets you tick individual awards on and off.' },
    ],
  },

  round: {
    title: 'Round modelling',
    intro: 'A what-if calculator for taking outside investment. Nothing here is saved and no investment is planned.',
    sections: [
      { q: 'Pre-money and post-money',
        a: 'Pre-money is what the company is worth before the investor’s cash arrives. Post-money is pre-money plus the cash. Raise ₦200m at ₦800m pre-money and the investor owns ₦200m of ₦1bn — 20%.' },
      { q: 'Dilution',
        a: 'Your slice getting smaller because new shares were created. You still own the same number of shares; there are just more shares in total.' },
      { q: 'The staff share pool',
        a: 'Shares set aside for future employees. "Created before the round" means you pay for all of it. Created after, the investor shares the cost. It is worth real money — usually a percent or two of the company.' },
      { q: 'Why your voting % is highlighted',
        a: 'Below 75% you can no longer change the company’s rules on your own. Below 50% you can no longer carry an ordinary vote on your own.' },
    ],
  },

  mystake: {
    title: 'My stake',
    intro: 'What you personally own, and what it is worth.',
    sections: [
      { q: 'Why shares come first and money second',
        a: 'Your share count is a hard fact. The naira figures depend on a valuation nobody has independently checked, so they are on a separate tab to keep the two apart.' },
      { q: 'Amount paid in',
        a: 'Shares × ₦10. What was originally put in. It never changes and it is not what your stake is worth.' },
      { q: 'Notional value',
        a: 'Your share of whatever value the company has been given. It only moves when somebody updates that number. It is an estimate, not a price anyone has offered.' },
      { q: 'Share of retained profit',
        a: 'Your slice of what the business has actually made and kept. This is the honest one. It can be negative while the company is losing money, and that is shown rather than hidden.' },
      { q: 'Can I take this money out?',
        a: 'No. Shareholders get paid when profit is formally distributed or when the company is sold. Neither has happened.' },
    ],
  },

  record: {
    title: 'Record',
    intro: 'Where you type in things the app cannot work out by itself.',
    sections: [
      { q: 'Expense',
        a: 'Money spent and gone. The category matters: green ones reduce gross profit and therefore reduce what everyone gets paid. Grey ones do not.' },
      { q: 'Revenue',
        a: 'Only for money that did NOT go through the app. App payments are counted automatically — typing one in here counts it twice and overpays people.' },
      { q: 'Capital in',
        a: 'Money that is not earnings: your own money put in, a loan, a grant. It never counts as revenue and never affects anyone’s pay.' },
      { q: 'Investment',
        a: 'Money spent on something you still own. Different from an expense, where the money is simply gone.' },
      { q: 'Money owed',
        a: 'Cash you are holding for somebody else and will hand over later.' },
      { q: 'Valuation',
        a: 'What you say the company is worth. Every stake value on the site is calculated from this, so the basis you pick is shown next to it everywhere.' },
    ],
  },

  live: {
    title: 'Live split',
    intro: 'Everyone who owns part of the company, and their share of the money as it arrives.',
    sections: [
      { q: 'What the numbers mean',
        a: 'If you own 80% of the company, 80 kobo of every naira that comes in is notionally yours. This page does that sum for everyone, live.' },
      { q: 'Can anyone actually take this money?',
        a: 'No. It is a share, not a balance. Money reaches a shareholder only when profit is formally distributed by resolution, or the company is sold. Neither has happened.' },
      { q: '"Of money in" vs "of what was kept"',
        a: 'Money in ignores what it cost to earn. What was kept is income minus everything spent, and is the honest one. It goes negative in a bad month, and it is shown negative rather than hidden.' },
      { q: 'Per ₦1 in',
        a: 'Their slice of the very next naira through the door. Owning 10% means 10 kobo of it.' },
      { q: 'Owed to campuses',
        a: 'Money promised to student associations under revenue-share deals. It is not the company’s and is taken off before anyone’s share is worked out.' },
      { q: 'Who can see this?',
        a: 'Everyone you have given finance access to. That is the point of it — nobody has to take your word for what they are owed a share of.' },
      { q: 'Salary is not on here',
        a: 'Correct. Salary comes from gross profit bands and is a completely separate thing from owning shares. See the Payroll tab.' },
    ],
  },

  schools: {
    title: 'Campuses',
    intro: 'What each school earns, and who takes a cut of that school.',
    sections: [
      { q: 'Why split money by campus',
        a: 'Your partnership offer gives a student association a share of the gross profit from THEIR campus — not the company. So the money has to be traceable to a school before anyone can be paid on it.' },
      { q: 'The standard offer',
        a: '10% of that campus’s gross profit, doubling to 15% if they refer over 1,000 students, for the length of their tenure.' },
      { q: 'Why the end date matters',
        a: 'An exco holds office for a year, not for ever. An agreement with no end date keeps taking a cut long after the people who earned it have graduated. The app marks a lapsed one and stops counting it.' },
      { q: '"Unattributed"',
        a: 'Payments from people whose campus is not recorded. Campus cuts are only calculated on traceable money, so nobody is paid a share of income that might not be from their school.' },
      { q: 'Matrons, excos, ambassadors',
        a: 'All the same mechanism — a named person or body, a percentage, a start and an end. Use the type field so you can tell them apart later.' },
    ],
  },

  people: {
    title: 'People',
    intro: 'Everyone who works here or owns part of the company, in one place.',
    sections: [
      { q: 'Why tags instead of one role',
        a: 'Because your admins are several things at once. Somebody can be staff and a shareholder and a director. One "role" field cannot say that, and round modelling needs to tell an owner from an employee from an outsider.' },
      { q: 'Shareholder is not a switch',
        a: 'It comes from the share register. It changes when shares actually move on the Ownership tab, not when somebody ticks a box.' },
      { q: 'Founding Team Member',
        a: 'Matters legally. Article 3 says only these people may ever hold Class A shares — the ten-vote ones.' },
      { q: 'Director',
        a: 'A director is the only person who can sign off your own milestone shares. You cannot certify your own.' },
      { q: 'Give access',
        a: 'Approves an email for the finance pages only. It does not let them into gists, users or moderation — those are under Account Permissions.' },
      { q: 'Salary types',
        a: 'Flat is the same every month. Officer and Founder use the contract bands, where pay rises and falls with gross profit and half of any shortfall is deferred.' },
      { q: 'Contracts',
        a: 'Stored privately. Links expire after five minutes, and only you and that person can open theirs.' },
    ],
  },

  reports: {
    title: 'Reports',
    intro: 'Download what is on screen as a PDF or a spreadsheet.',
    sections: [
      { q: 'Balance sheet',
        a: 'A snapshot: what came in, what went out, what you own, what you owe.' },
      { q: 'Profit and loss',
        a: 'Earnings minus costs over the period you picked.' },
      { q: 'Which ones follow the date filter?',
        a: 'The money ones. Ownership, payroll and milestones are point-in-time and always show today.' },
      { q: 'Why my email is on every file',
        a: 'These contain salaries and ownership. If one is ever shared where it should not be, the file says who downloaded it and when.' },
    ],
  },
};

export function Explain({ tab }: { tab: string }) {
  const [open, setOpen] = useState(false);
  const content = EXPLAIN[tab];
  if (!content) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Explain this page in plain English"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        What is this page?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
             onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-2xl w-full my-8"
               onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {content.title}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{content.intro}</p>
              </div>
              <button onClick={() => setOpen(false)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {content.sections.map((s, i) => (
                <div key={i}>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {s.q}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {s.a}
                  </p>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setOpen(false)}
                      className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
