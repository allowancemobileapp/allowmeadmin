const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

// Add imports
if (!app.includes('import FeedApprovals')) {
  app = app.replace('import Transactions from \'./pages/Transactions\';', 'import Transactions from \'./pages/Transactions\';\nimport FeedApprovals from \'./pages/FeedApprovals\';\nimport SchoolManagement from \'./pages/SchoolManagement\';');
}

// Add navigation items
const feedNav = `{ to: '/approvals/feed', label: 'Feed Approvals', icon: FileCheck, id: 'feed_approvals' },`;
const schoolNav = `{ to: '/schools', label: 'School Mgmt', icon: School, id: 'schools' },`;

if (!app.includes('/approvals/feed')) {
  app = app.replace(/{ to: '\/approvals\/services', label: 'Services Approvals', icon: CheckCircle, id: 'approvals_services' },/g, `{ to: '/approvals/services', label: 'Services Approvals', icon: CheckCircle, id: 'approvals_services' },\n    ${feedNav}`);
}

if (!app.includes('/schools')) {
  app = app.replace(/{ to: '\/analytics', label: 'Analytics', icon: Activity, id: 'analytics' },/g, `{ to: '/analytics', label: 'Analytics', icon: Activity, id: 'analytics' },\n    ${schoolNav}`);
}

// Add lucide imports
if (!app.includes('FileCheck')) {
  app = app.replace('Activity,', 'Activity, FileCheck, School,');
}

// Add routes
if (!app.includes('<Route path="/approvals/feed"')) {
  app = app.replace('<Route path="/approvals/services" element={<ServiceApprovals />} />', '<Route path="/approvals/services" element={<ServiceApprovals />} />\n            <Route path="/approvals/feed" element={<FeedApprovals />} />');
}
if (!app.includes('<Route path="/schools"')) {
  app = app.replace('<Route path="/analytics" element={<Analytics />} />', '<Route path="/analytics" element={<Analytics />} />\n            <Route path="/schools" element={<SchoolManagement />} />');
}

fs.writeFileSync('src/App.tsx', app);
console.log('App patched');
