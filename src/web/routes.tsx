import { createRootRoute, createRoute, createRouter, lazyRouteComponent, notFound } from '@tanstack/react-router';
import { ErrorPanel } from './components/states';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { Shell } from './Shell';

const Activity = lazyRouteComponent(() => import('./pages/Activity'));
const AddJob = lazyRouteComponent(() => import('./pages/AddJob'));
const ApplicationPage = lazyRouteComponent(() => import('./pages/ApplicationPage'));
const Applications = lazyRouteComponent(() => import('./pages/Applications'));
const Autopilot = lazyRouteComponent(() => import('./pages/Autopilot'));
const Compare = lazyRouteComponent(() => import('./pages/Compare'));
const Contacts = lazyRouteComponent(() => import('./pages/Contacts'));
const HiredMode = lazyRouteComponent(() => import('./pages/HiredMode'));
const ImapSync = lazyRouteComponent(() => import('./pages/ImapSync'));
const Insights = lazyRouteComponent(() => import('./pages/Insights'));
const JobPage = lazyRouteComponent(() => import('./pages/JobPage'));
const Markets = lazyRouteComponent(() => import('./pages/Markets'));
const NotFound = lazyRouteComponent(() => import('./pages/NotFound'));
const Offers = lazyRouteComponent(() => import('./pages/Offers'));
const Opportunities = lazyRouteComponent(() => import('./pages/Opportunities'));
const Outreach = lazyRouteComponent(() => import('./pages/Outreach'));
const Prep = lazyRouteComponent(() => import('./pages/Prep'));
const Profile = lazyRouteComponent(() => import('./pages/Profile'));
const ResumeStudio = lazyRouteComponent(() => import('./pages/ResumeStudio'));
const Sources = lazyRouteComponent(() => import('./pages/Sources'));
const StarVault = lazyRouteComponent(() => import('./pages/StarVault'));

// The dashboard route tree. Record ids are opaque slugs; anything else is "not found" rather
// than a request to the API.
const ID = /^[A-Za-z0-9_-]+$/;
const requireId = ({ params }: { params: { id: string } }): void => {
  if (!ID.test(params.id)) throw notFound();
};

const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: NotFound,
  errorComponent: () => (
    <ErrorPanel
      message="This view could not be loaded while offline or restarting."
      onRetry={() => window.location.reload()}
    />
  ),
});

const page = (path: string, component: typeof Home | ReturnType<typeof lazyRouteComponent>) =>
  createRoute({ getParentRoute: () => rootRoute, path, component });

const jobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$id',
  beforeLoad: requireId,
  component: function JobRoute() {
    const { id } = jobRoute.useParams();
    return <JobPage key={id} id={id} />;
  },
});

const applicationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/applications/$id',
  beforeLoad: requireId,
  component: function ApplicationRoute() {
    const { id } = applicationRoute.useParams();
    return <ApplicationPage key={id} id={id} />;
  },
});

const prepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/applications/$id/prep',
  beforeLoad: requireId,
  component: function PrepRoute() {
    const { id } = prepRoute.useParams();
    return <Prep key={id} applicationId={id} />;
  },
});

const routeTree = rootRoute.addChildren([
  page('/', Home),
  page('/settings', Settings),
  page('/profile', Profile),
  page('/outreach', Outreach),
  page('/contacts', Contacts),
  page('/markets', Markets),
  page('/offers', Offers),
  page('/activity', Activity),
  page('/insights', Insights),
  page('/imap-sync', ImapSync),
  page('/hired', HiredMode),
  page('/star-vault', StarVault),
  page('/opportunities', Opportunities),
  page('/opportunities/sources', Sources),
  page('/opportunities/new', AddJob),
  page('/opportunities/compare', Compare),
  page('/resume', ResumeStudio),
  page('/autopilot', Autopilot),
  page('/applications', Applications),
  applicationRoute,
  prepRoute,
  jobRoute,
]);

// Search params stay plain strings exactly as written in the URL (the default parser would turn
// "?min=80" into a number and re-encode values), so links and bookmarks are unchanged.
export const router = createRouter({
  routeTree,
  parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
  stringifySearch: (search) => {
    const s = new URLSearchParams(search as Record<string, string>).toString();
    return s ? `?${s}` : '';
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
