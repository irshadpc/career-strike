import { createRootRoute, createRoute, createRouter, lazyRouteComponent, notFound } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NotFound } from './pages/NotFound';
import { Shell } from './Shell';

const Activity = lazyRouteComponent(() => import('./pages/Activity'), 'Activity');
const AddJob = lazyRouteComponent(() => import('./pages/AddJob'), 'AddJob');
const ApplicationPage = lazyRouteComponent(() => import('./pages/ApplicationPage'), 'ApplicationPage');
const Applications = lazyRouteComponent(() => import('./pages/Applications'), 'Applications');
const Compare = lazyRouteComponent(() => import('./pages/Compare'), 'Compare');
const Home = lazyRouteComponent(() => import('./pages/Home'), 'Home');
const Insights = lazyRouteComponent(() => import('./pages/Insights'), 'Insights');
const JobPage = lazyRouteComponent(() => import('./pages/JobPage'), 'JobPage');
const Markets = lazyRouteComponent(() => import('./pages/Markets'), 'Markets');
const Opportunities = lazyRouteComponent(() => import('./pages/Opportunities'), 'Opportunities');
const Outreach = lazyRouteComponent(() => import('./pages/Outreach'), 'Outreach');
const Prep = lazyRouteComponent(() => import('./pages/Prep'), 'Prep');
const Profile = lazyRouteComponent(() => import('./pages/Profile'), 'Profile');
const ResumeStudio = lazyRouteComponent(() => import('./pages/ResumeStudio'), 'ResumeStudio');
const Settings = lazyRouteComponent(() => import('./pages/Settings'), 'Settings');
const Sources = lazyRouteComponent(() => import('./pages/Sources'), 'Sources');

// The dashboard route tree. Record ids are opaque slugs; anything else is "not found" rather
// than a request to the API.
const ID = /^[A-Za-z0-9_-]+$/;
const requireId = ({ params }: { params: { id: string } }): void => {
  if (!ID.test(params.id)) throw notFound();
};

const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFound });

const page = (path: string, component: any) => createRoute({ getParentRoute: () => rootRoute, path, component });

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
  page('/markets', Markets),
  page('/activity', Activity),
  page('/insights', Insights),
  page('/opportunities', Opportunities),
  page('/opportunities/sources', Sources),
  page('/opportunities/new', AddJob),
  page('/opportunities/compare', Compare),
  page('/resume', ResumeStudio),
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
