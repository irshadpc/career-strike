# A practical job-hunt guide

Career Strike is a private workspace for running a deliberate job search. It does not promise a
job, send applications for you or turn a job board into a source of facts it does not contain.
It helps you make the next good decision, preserve evidence, and avoid repeating work.

Use this guide in order for a first search, then return to the weekly routine. The app works
without any AI assistant.

## The first hour

### 1. Protect your starting point

Install, initialise and open Career Strike as described in [install.md](install.md). Your data is
kept locally. Before adding documents or personal history, read the short version of the
[privacy model](privacy.md): only public ATS requests leave the computer; the dashboard,
applications and profile remain local.

If you already have a spreadsheet or notes, do not rush to copy everything. Begin with roles that
are active or that you will apply for next. Use **Add a job** to record an opportunity you found
elsewhere; it remains visibly **Unverified** until a permitted source can verify it.

### 2. Build a useful profile, not a perfect autobiography

Open **Profile** and add facts that you are comfortable using in a job comparison:

- core skills and technologies you have actually used;
- previous roles, domains and outcomes;
- education, certifications and languages where relevant;
- a résumé text extract if you want Career Strike to suggest facts for your review.

Approve only true suggestions. A missing skill is better than an invented one. The app explains
fit from saved profile facts and quoted employer requirements; it cannot infer experience that you
did not add.

### 3. Tell Career Strike what “right for me” means

Open **Settings** and set a small, usable starting point:

| Setting                                            | Why it matters                                      | Example                                                   |
| -------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Preferred roles                                    | Helps role and skills matching                      | Backend engineer, iOS engineer, technical product manager |
| Target countries and cities                        | Ranks places you want to work                       | `IN`, then Bengaluru and Pune                             |
| Country of residence and countries you can work in | Checks location eligibility                         | `IN`; other countries only when you are authorised there  |
| Work authorisation by country                      | Keeps sponsorship separate from location preference | `DE=needs_sponsorship`                                    |
| Work arrangement and employment types              | Removes roles you do not want                       | Remote or hybrid; full-time                               |
| Salary expectation                                 | Compares only against published salaries            | A minimum in the currency and period you choose           |
| Excluded employers                                 | Prevents repeated distractions                      | Organisations you have decided not to pursue              |

Target countries are a preference; they are not proof that you may work there. A job can be a
good location preference but still be ineligible if it explicitly requires work authorisation you
do not have. Conversely, a viable role outside a preferred city is not hidden—it is simply ranked
lower.

## Find trustworthy opportunities

### Start with employer-direct boards

Under **Opportunities → Job boards**, add public Greenhouse, Lever or Ashby careers pages for
employers you genuinely want to follow. These are the supported automated discovery paths. When
you add a board or choose **Fetch now**, Career Strike records source, application link and the
last successful retrieval. You may enable a refresh interval while the local service is running.

Choose employers deliberately. A useful first list is 10–30 organisations that match your role,
location and domain interests. Prefer the employer’s official careers page over a copy on another
site where both describe the same role.

### Use marketplaces as research, not as hidden automation

For websites that do not provide verified permitted access, search on the provider's own site and
open the employer’s official posting before tracking it. Career Strike will not work around a
login, CAPTCHA, paywall or platform restriction.

For India, use the dashboard’s official-site launchers and follow the detailed
[India discovery guide](india-job-discovery.md). It distinguishes monitored employer-direct
boards, user-driven portals and restricted/unverified marketplaces. India should be called
**Discovery available** only after `career-strike verify-market IN --target <id>` succeeds from a
networked local installation with an explicit India posting. Singapore works the same way with
four reviewed employer-direct boards; see the
[Singapore discovery guide](singapore-job-discovery.md). The United Arab Emirates works the same
way with four reviewed employer-direct boards; see the
[UAE discovery guide](uae-job-discovery.md). Japan, the United Kingdom, Australia and Canada also
work that way with four reviewed employer-direct boards each; see the
[Japan discovery guide](japan-job-discovery.md), the
[UK discovery guide](uk-job-discovery.md), the
[Australia discovery guide](australia-job-discovery.md) and the
[Canada discovery guide](canada-job-discovery.md). Germany and the other Southeast Asian
markets have reviewed employer-direct targets too; see the
[Germany discovery guide](germany-job-discovery.md) and the
[Southeast Asia discovery guide](southeast-asia-job-discovery.md).

Germany, India, Singapore, Malaysia, Indonesia, the Philippines, Thailand, Vietnam, the
United Arab Emirates, Japan, the United Kingdom, Australia and Canada can be selected as markets
today. A configured market is not the same as automated coverage. See
[known limitations](limitations.md#job-sources) before relying on a source.

### Explore Curated Collections & Company Intelligence 360

Under **Opportunities → Collections**, you can browse opportunities through 8 dynamic, explainable collections rather than generic boards:
- **Emerging AI**: Early-to-growth stage startups building proprietary foundation models, agents, and AI infrastructure.
- **Fintech & Payment Infrastructure**: Scaleups operating in transaction processing, banking rails, risk, and fraud engineering.
- **High-Growth Scaleups**: Organizations demonstrating active hiring across multiple teams and recent funding milestones.
- **Global International Employers**: Multinational technology companies offering clear international relocation or global remote hubs.
- **Remote-First Engineering**: Teams with documented distributed engineering cultures and asynchronous workflows.
- **Active Product Roles**: Curated opportunities across product management, technical product strategy, and user experience.
- **QA & IT Operations**: Focused openings in site reliability, infrastructure security, and quality assurance.
- **Early-Career & Transition Paths**: Roles welcoming transferable technical skills or early-career engineers.

You can also build **Custom Collections** with your own combination of role families, seniorities, arrangements, and company stages.

When evaluating an employer, click **Company 360** to inspect:
1. **Corporate stage & identity**: Seed, Series A–D, or Public, along with official careers page and headquarters.
2. **Headcount trajectory**: Recorded historical team size changes and dates of observation.
3. **Funding history**: Documented funding rounds and investors. Note that funding indicates capital raised, not financial health or open headcount.
4. **Verified tech stack**: Languages, frameworks, and cloud infrastructure observed in current engineering postings.
5. **Startup momentum**: Real-time momentum classification (`SURGING`, `STEADY`, `STAGNANT`, `COOLING`) based strictly on observed local posting velocity and dated corporate events.
6. **Watchlist**: Add target employers to your personal watchlist to receive updates when new postings appear.

### Use a five-minute capture rule

When you find a promising role outside a monitored board:

1. Check that the employer and application URL are official.
2. Add the role with its title, employer, location and official link.
3. Keep it **Unverified** unless an authorised board confirms it.
4. Add a short candidate note explaining why it may be worth attention.
5. Do not apply from a marketplace copy if the employer posting has disappeared or conflicts.

This creates a useful record without pretending the vacancy is still active.

## Decide what to pursue

Open **Opportunities** and use the filters in this sequence:

1. Pick a market and, when useful, a city.
2. Start with **Verified open** or **Recently verified**.
3. Filter for work arrangement, seniority/title terms and source.
4. Use **Best fit** only after you have added profile facts and preferences.
5. Open a role before shortlisting it; the summary is not the application.

The detail view tells you why a role is ranked. Read the factors separately:

| Signal             | What it answers                                           | Safe interpretation                                                |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Skill fit          | Do your saved skills match stated requirements?           | Missing skill evidence is not a verdict on your potential.         |
| Eligibility        | Does the posting name a country where you may work?       | Unknown means the source did not give enough evidence.             |
| Work authorisation | Does the stated sponsorship policy fit your saved status? | Only an explicit “no sponsorship” blocks a candidate who needs it. |
| Target market      | Is this in a preferred country or city?                   | A mismatch lowers preference, not legal eligibility.               |
| Freshness          | Has the source listed it recently?                        | Stale or unverified roles need a manual check.                     |

Remote is not automatically worldwide. A remote job can be limited to a country, region or time
zone. Sponsorship is separate again. Keep unknown fields unknown until the employer says more.

### The 6-Dimension Opportunity Evaluation

Career Strike assesses each opportunity across six orthogonal, non-negotiable dimensions rather than blending them into a single misleading percentage:

1. **Hard Eligibility**: Validates statutory right to work, residency, and employer sponsorship policy. If you lack work authorization and the employer explicitly does not sponsor, the role is flagged as an eligibility blocker. Blocker states are **never** hidden or averaged out.
2. **Professional Relevance**: Evaluates overlap between quoted employer requirements and your confirmed profile skills and accomplishments.
3. **Candidate Preferences**: Checks alignment with your target titles, salary expectations, preferred work arrangement (Remote/Hybrid/Onsite), and company stage preferences.
4. **Source Confidence**: Differentiates direct ATS feeds (Greenhouse, Lever, Ashby) verified within 72 hours from stale feeds or manual candidate entries.
5. **Company Context**: Considers organization stage, headcount trajectory, financial runway, and tech stack alignment.
6. **Application Effort**: Assesses the preparation work required (screening questions, portfolios, technical assessments, work authorization declarations).

Based on these 6 dimensions, Career Strike synthesizes a concrete **Next Best Action**:
- `PREPARE_APPLICATION`: High eligibility and relevance with reasonable effort—ready for tailoring.
- `VERIFY_ELIGIBILITY`: Potentially strong role, but sponsorship or location eligibility is unknown and requires employer verification.
- `RESEARCH_COMPANY`: Promising role where company stage, momentum, or tech stack needs closer review before investing effort.
- `PASS`: Clear eligibility mismatch or severe preference conflict—safe to mark "Not for me" to keep your pipeline clean.

### Evaluate Compensation with Evidence

Under the **Compensation Intelligence** panel on any role:
- **Source Breakdown**: Identifies whether the numbers represent an **Employer-Disclosed** range, an **External Benchmark**, a **Candidate-Reported** datapoint, or a **Model Estimate**.
- **Percentile Distributions**: P25, P50 (median), and P75 compensation figures are displayed **only** when supported by a verified sample size ($N \ge 5$). When data is scarce, Career Strike states the sample size honestly rather than generating artificial percentiles.
- **Total Compensation Breakdown**: Separates base salary from variable bonuses, signing bonuses, and documented equity.
- **Foreign Currency Realities**: If you are exploring international roles, nominal currency conversion rates reflect exchange rates, not local purchasing power or living costs. Always review local cost-of-living realities before setting salary targets.

### A simple shortlist standard

Shortlist a role when all of these are true:

- the title and work are genuinely interesting;
- the employer posting still exists;
- no explicit eligibility or sponsorship conflict is shown;
- you can name one or two truthful reasons your experience is relevant; and
- you are willing to prepare a tailored application within the next few days.

Mark **Not for me** when you have made a real decision. This is not failure; it makes the next
search cleaner. Use comparison for two to four similar shortlisted roles when deciding where to
spend effort.

## Prepare and submit safely

The application workflow is intentionally separated from submission:

```text
Discovered → Evaluated → Shortlisted → Prepared → Awaiting approval
        → Submitted → Follow-up → Interview → Offer / Rejected / Withdrawn / Closed
```

For each shortlisted role:

1. Open the official application URL and read the current description again.
2. Choose **Prepare an application** in Career Strike.
3. Tailor the résumé, cover letter and notes to statements you can support.
4. Review the package in **Applications**. Approval signs that exact version; editing it cancels
   the approval.
5. Submit it yourself on the employer’s official site.
6. Record **Submitted** only after you see a confirmation or complete the application yourself.
7. Add a follow-up reminder and record recruiter replies, tests and interviews as they happen.

Opening a URL is not a submission. A prepared draft is not a submission. Career Strike does not
upload your documents, send email, message a recruiter or submit a real application for you.

### Use the Interview Knowledge Studio

When an opportunity advances to the interview stage, open the **Knowledge Studio** under **Prep**:

1. **Stage Format Playbooks**:
   - **Recruiter Screening**: Align on compensation ranges, sponsorship requirements, timeline expectations, and core narrative.
   - **System Design & Architecture**: Concrete frameworks for scoping requirements, defining high-level architectures, trade-off analysis, and deep-diving into data schemas.
   - **Behavioral STAR Rounds**: Structure real accomplishments using Situation, Task, Action, and Result, linking them directly to quoted employer competencies.
   - **Executive & Hiring Manager Deep-Dive**: Formulate strategic questions on team roadmap, engineering velocity, technical debt management, and cultural values.
2. **4-Step Company Research Protocol**:
   - *Step 1: Business Model*: How does the company make money? Who are its primary customers and what is its pricing strategy?
   - *Step 2: Technical Architecture*: What is their observed tech stack, cloud provider, and scale?
   - *Step 3: Team Dynamics*: Who leads the engineering and product organizations? Recent team growth or restructuring?
   - *Step 4: Competitive Landscape*: Who are the direct competitors and what is the company's core technological differentiation?
3. **Principled Compensation Negotiation**:
   - Benchmark against verified P25/P50/P75 ranges from the Compensation Intelligence panel.
   - Negotiate on total compensation: base salary, equity vesting schedules, performance bonuses, and remote stipends.
   - Reference documented, attributed guidance from verified industry compensation practitioners.

## Run a sustainable weekly rhythm

### Each working day: 20–45 minutes

- Check **Home** for the next best actions.
- Review newly verified roles from your selected boards and Curated Collections.
- Check the 6D evaluation and `nextBestAction` on new roles before shortlisting.
- Make one clear decision on each role: exclude, shortlist or leave it for later.
- Prepare or submit only the number of applications you can tailor truthfully.
- Update the pipeline immediately after an employer interaction.

### Once a week: 30–60 minutes

- Refresh the employer boards that matter; investigate any degraded board rather than assuming all its jobs closed.
- Check your **Company Watchlist** for new openings or momentum changes at target employers.
- Inspect **Insights → Market Pulse** to track shifting remote working ratios, top skills in demand, and hiring velocity across your target markets.
- Review stale and unverified roles; verify them on the employer site or close them honestly.
- Check follow-ups and upcoming interviews using the **Knowledge Studio** playbooks.
- Create a backup before a major rewrite of your profile or search strategy.

### At the end of a search phase

Export or back up your workspace. Use the actual history—not memory—to review which markets,
employer types and role families produced useful conversations. Treat a small sample as a prompt
for exploration, not proof of cause.

## Optional: work with an AI assistant

Career Strike can connect Codex, Claude Code or OpenCode through MCP, but they are optional. An
assistant may help search the local collected roles, compare jobs or draft a structured summary.
It cannot submit applications, approve them, access your documents or contact details, or change
your settings.

Start with the connection instructions in [install.md](install.md#connecting-an-ai-assistant-optional).
If an assistant requests profile information, read its stated purpose and inspect the exact values
in **Settings → AI assistants** before approving. Share the smallest amount needed. An approval is
single-use.

For an MCP-capable client outside the built-in integrations, use the generic route documented in
[install.md](install.md#any-compatible-mcp-client). This includes an Axym deployment only when its
operator has confirmed local stdio MCP support; Axym is never required for Career Strike to work.

## When something is unclear

- A job is missing: make sure the correct board was added and check its source health. Career
  Strike does not search every employer on the internet.
- A job seems closed: distinguish a source timeout from evidence of closure. Check the employer
  link and the last verified time.
- Eligibility is unknown: keep it unknown, then ask the employer or read the official policy.
- A source asks for a login or CAPTCHA: use it manually in your browser; do not attempt to bypass
  it.
- You want to change direction: edit target roles, countries and cities first; your existing jobs
  and applications remain in the local workspace.
- You need to recover: use `career-strike doctor`, then consult [install.md](install.md) for
  backup, restore and troubleshooting.

The aim is not to maximize a job count. It is to keep a short, evidence-backed queue of roles you
can pursue well.
