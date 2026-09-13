import { useEffect, useMemo, useState } from 'react';
import { Icon } from './components/Icon';
import { medrippleApi } from './services/medrippleApi';

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'facility', label: 'Facility detail', icon: 'building' },
  { id: 'candidates', label: 'Candidates', icon: 'users' },
  { id: 'simulator', label: 'Ripple simulator', icon: 'ripple' },
  { id: 'plan', label: 'Plan review', icon: 'clipboard' },
  { id: 'audit', label: 'Audit trail', icon: 'activity' },
];

const riskLabels = { healthy: 'Healthy', watch: 'Watch', critical: 'Critical' };

function RiskBadge({ tone = 'watch', children }) {
  return <span className={`risk-badge risk-${tone}`}><span className="risk-dot" />{children || riskLabels[tone] || tone}</span>;
}

function EmptyOrError({ title, copy, onRetry }) {
  return <section className="state-card" role="alert">
    <div className="state-icon"><Icon name="alert" size={25} /></div>
    <h2>{title}</h2>
    <p>{copy}</p>
    {onRetry && <button className="button button-primary" onClick={onRetry}><Icon name="refresh" />Try again</button>}
  </section>;
}

function AppShell({ active, onNavigate, children, menuOpen, setMenuOpen, snapshotAt, dateLabel }) {
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
      <div className="brand">
        <div className="brand-mark"><Icon name="ripple" size={20} /></div>
        <div><strong>MEDRIPPLE</strong><span>Care, connected.</span></div>
        <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
      </div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="side-nav">
        {navigation.map((item) => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => { onNavigate(item.id); setMenuOpen(false); }}>
          <Icon name={item.icon} size={17} /><span>{item.label}</span>{item.id === 'candidates' && <b className="nav-count">5</b>}
        </button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="network-mini"><span className="status-light" />Network snapshot <small>8 facilities connected</small></div>
      <button className="guide-link"><span className="guide-mark">?</span>Workspace guide</button>
      <div className="user-card"><div className="avatar">RC</div><div><strong>Regional coordinator</strong><span>Chennai region</span></div></div>
    </aside>
    {menuOpen && <button className="backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="main-panel">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
        <div className="crumbs"><span>Workspace</span><Icon name="chevron" size={15} /><strong>{navigation.find((item) => item.id === active)?.label}</strong></div>
        <div className="topbar-actions"><span className="demo-chip"><i />Demo workspace</span><span className="date-chip">{dateLabel || 'Snapshot'}</span></div>
      </header>
      <div className="page-content">{children}</div>
      <footer className="app-footer"><Icon name="shield" size={15} />Prototype decision support - all transfers require human approval. <span>Snapshot: {snapshotAt || 'Loading…'}</span></footer>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, copy, action }) {
  return <div className="page-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{copy && <p className="page-copy">{copy}</p>}</div>
    {action}
  </div>;
}

function MetricCard({ metric }) {
  return <article className="metric-card">
    <div className="metric-head"><span>{metric.label}</span><div className={`metric-icon ${metric.tone}`}><Icon name={metric.icon} size={17} /></div></div>
    <div className="metric-value">{metric.value} {metric.unit && <small>{metric.unit}</small>}</div>
    <p className={metric.tone === 'critical' ? 'metric-alert' : metric.tone === 'healthy' ? 'metric-good' : ''}>{metric.tone === 'critical' ? '● ' : metric.tone === 'healthy' ? '↗ ' : '↘ '}{metric.detail}</p>
  </article>;
}

function RegionalMap({ facilities, onSelect }) {
  const active = facilities.find((item) => item.id === 'central') || facilities[0];
  const links = [['porur', 'anna-nagar'], ['anna-nagar', 'northside'], ['anna-nagar', 'central'], ['northside', 'central'], ['central', 'velachery'], ['central', 'adyar'], ['central', 'east-coast'], ['central', 'tambaram']];
  const get = (id) => facilities.find((item) => item.id === id);
  return <div className="map-card">
    <div className="card-title"><div><h2>Regional map</h2><p>Connected facility coverage · schematic view</p></div><span>CHENNAI REGION</span></div>
    <div className="regional-map" role="img" aria-label="Schematic regional map showing eight facilities and their risk states">
      <div className="map-grid" />
      <div className="map-label label-west">WEST CHENNAI</div><div className="map-label label-south">SOUTH CHENNAI</div><div className="watermark">BAY OF BENGAL</div>
      <svg className="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{links.map(([from, to]) => { const a = get(from); const b = get(to); return a && b ? <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null; })}</svg>
      {facilities.map((site) => <button key={site.id} className={`map-node node-${site.risk} ${site.id === 'central' ? 'selected' : ''}`} style={{ left: `${site.x}%`, top: `${site.y}%` }} onClick={() => onSelect(site)} aria-label={`View ${site.name}, ${riskLabels[site.risk]}, ${site.days} days remaining`}><span /><b>{site.name}</b></button>)}
      <div className="map-legend"><RiskBadge tone="healthy" /><RiskBadge tone="watch" /><RiskBadge tone="critical" /><span className="line-legend" />Connection</div>
      <div className="map-popover"><div><strong>{active.name}</strong><RiskBadge tone={active.risk} /></div><p>{active.days} days <span>{active.medicine}</span></p></div>
      <span className="map-note">Not to scale</span>
    </div>
  </div>;
}

function Dashboard({ data, onNavigate }) {
  const [selectedSite, setSelectedSite] = useState(null);
  const selected = selectedSite || data.facilities.find((item) => item.risk === 'critical') || data.facilities[0];
  return <>
    <PageHeading eyebrow="NETWORK INTELLIGENCE" title="Regional overview" copy="A healthier network starts with seeing the whole picture." action={<div className="heading-actions"><button className="view-chip">Overview</button><button className="button button-primary" onClick={() => onNavigate('simulator')}><Icon name="ripple" />Simulate plan</button><small>Snapshot: {data.snapshotAt}</small></div>} />
    <section className="metrics-grid">{data.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>
    <section className="dashboard-bottom">
      <RegionalMap facilities={data.facilities} onSelect={setSelectedSite} />
      <aside className="alerts-card"><div className="card-title"><div><h2>Critical alerts</h2><p>Signals requiring review</p></div><span className="alert-count">{data.alerts.length}</span></div><div className="alert-list">{data.alerts.map((alert, index) => <button className="alert-item" key={`${alert.facility}-${index}`} onClick={() => onNavigate('facility')}><span className={`alert-rail ${alert.tone}`} /><div><strong>{alert.facility}</strong><p>{alert.medicine}</p><small>{alert.summary}</small><RiskBadge tone={alert.tone}>{alert.status}</RiskBadge></div><Icon name="chevron" size={16} /></button>)}</div></aside>
    </section>
    <button className="selected-facility-strip" onClick={() => onNavigate('facility')}><div className="strip-icon"><Icon name="building" /></div><div><span>Selected facility</span><strong>{selected.name} · {selected.days} days of coverage</strong></div><RiskBadge tone={selected.risk} /><Icon name="arrow" /></button>
  </>;
}

function ForecastChart({ values }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${90 - (value / 100) * 78}`).join(' ');
  const area = `0,92 ${points} 100,92`;
  return <div className="forecast-chart" aria-label="Fourteen day effective stock forecast"><div className="chart-axis-label y-top">100</div><div className="chart-axis-label y-bottom">0</div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="forecastFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#0ea5a8" stopOpacity=".25" /><stop offset="1" stopColor="#0ea5a8" stopOpacity="0" /></linearGradient></defs><line x1="0" y1="43" x2="100" y2="43" className="threshold-line" /><polygon points={area} fill="url(#forecastFill)" /><polyline points={points} className="forecast-line" /><line x1="54" y1="0" x2="54" y2="92" className="stockout-line" /></svg><span className="threshold-tag">Safety stock</span><span className="stockout-tag">Projected stockout</span><div className="chart-days"><span>Today</span><span>Day 3</span><span>Day 7</span><span>Day 14</span></div></div>;
}

function FacilityDetail({ data, onNavigate }) {
  return <>
    <PageHeading eyebrow="FACILITY INTELLIGENCE" title={data.name} copy={`${data.type} · ${data.region}`} action={<button className="button button-secondary" onClick={() => onNavigate('candidates')}>View safe candidates <Icon name="arrow" /></button>} />
    <section className="facility-banner"><div><span className="banner-eyebrow">ACTIVE MEDICINE RISK</span><h2>{data.medicine}</h2><p>{data.presentation} · {data.freshness}</p></div><div className="risk-score"><span>Risk score</span><strong>{data.riskScore}<small>/100</small></strong><RiskBadge tone={data.risk}>Critical</RiskBadge></div></section>
    <section className="facility-metrics"><article><span>Effective stock</span><strong>{data.effectiveStock} <small>{data.unit}</small></strong><p>Usable, compatible, and in-date</p></article><article><span>Daily demand</span><strong>{data.dailyDemand} <small>{data.unit}/day</small></strong><p>Forecasted average consumption</p></article><article><span>Incoming supply</span><strong>{data.incomingSupply.amount} <small>{data.unit}</small></strong><p className="metric-alert">{data.incomingSupply.status} · {data.incomingSupply.eta}</p></article><article><span>Coverage remaining</span><strong>{data.daysRemaining} <small>days</small></strong><p className="metric-alert">Below the 4-day threshold</p></article></section>
    <section className="facility-grid"><article className="content-card forecast-card"><div className="card-title"><div><h2>Forecast timeline</h2><p>Projected usable stock through the next 14 days</p></div><span className="chart-legend"><i />Effective stock</span></div><ForecastChart values={data.series} /><div className="forecast-note"><Icon name="alert" /><div><strong>Projected stockout in {data.daysRemaining} days</strong><span>Replenishment is expected after the projected stockout date.</span></div></div></article><aside className="evidence-card"><h2>Why this is flagged</h2><div className="evidence-item"><span className="evidence-icon cause"><Icon name="activity" /></span><div><small>Primary cause</small><strong>{data.cause}</strong><p>Recent daily consumption is 32% above the rolling baseline.</p></div></div><div className="evidence-item"><span className="evidence-icon confidence"><Icon name="shield" /></span><div><small>Forecast confidence</small><strong>{data.confidence}</strong><p>Based on 60 days of verified inventory and demand data.</p></div></div><div className="evidence-item"><span className="evidence-icon fresh"><Icon name="refresh" /></span><div><small>Data freshness</small><strong>Current inventory signal</strong><p>{data.freshness}</p></div></div></aside></section>
    <section className="next-step-card"><div><span className="eyebrow">SAFE WORKFLOW</span><h2>Resolve this alert in three clear steps.</h2></div><ol>{data.nextSteps.map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}</ol><button className="button button-primary" onClick={() => onNavigate('candidates')}>Review candidates <Icon name="arrow" /></button></section>
  </>;
}

function Candidates({ data, onNavigate }) {
  return <>
    <PageHeading eyebrow="TRANSFER SAFETY" title="Eligible donor candidates" copy={`Safe options for ${data.target} · ${data.medicine}`} action={<button className="button button-primary" onClick={() => onNavigate('simulator')}>Simulate best transfer <Icon name="arrow" /></button>} />
    <section className="warning-banner"><div className="warning-symbol">!</div><div><strong>Downstream ripple danger identified</strong><p>Sourcing exclusively from one donor is discouraged. It may solve today's shortage while breaching that facility's protected safety stock. Multi-source selection is recommended.</p></div></section>
    <section className="candidate-summary"><div><span>REQUESTED COVERAGE</span><strong>{data.request} {data.unit}</strong><small>to restore a 7-day safe buffer</small></div><div><span>SAFE CAPACITY FOUND</span><strong>{data.safeCapacity ?? 40} {data.unit}</strong><small>across {data.rows.filter((row) => row.eligible).length} viable source facilities</small></div><div><span>PROTECTED SITES</span><strong>{data.protectedCount ?? data.rows.filter((row) => !row.eligible).length} blocked</strong><small>safety or expiry constraint applied</small></div></section>
    <section className="table-card"><div className="table-title"><div><h2>Donor assessment</h2><p>Exact presentation matching, safety stock, route conditions, and expiry are checked for every option.</p></div><RiskBadge tone="watch">Human review required</RiskBadge></div><div className="table-scroll"><table><thead><tr><th>Facility / distance</th><th>Stock level</th><th>Safe surplus</th><th>Cold chain & expiry</th><th>Transfer feasibility</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><strong>{row.facility}</strong><small>{row.distance} away · {row.type}</small></td><td>{row.stock} {row.unit}</td><td><span className="surplus">+{row.surplus} safe {row.unit}</span></td><td><strong className={row.chain.includes('pending') ? 'watch-text' : ''}>{row.chain}</strong><small>Expires {row.expiry}</small></td><td><RiskBadge tone={row.eligible ? 'healthy' : 'critical'}>{row.eligible ? 'Safe candidate' : 'Rejected'}</RiskBadge><small className="reason">{row.reason}</small></td></tr>)}</tbody></table></div></section>
    <section className="candidate-footer"><div><Icon name="shield" /><span><strong>Why candidates can be rejected</strong>Every source must retain protected coverage; compatible stock must arrive safely before its expiry.</span></div><button className="button button-primary" onClick={() => onNavigate('simulator')}>Compare safe plan <Icon name="arrow" /></button></section>
  </>;
}

function StateBlock({ label, items }) {
  return <div className="state-block"><span>{label}</span>{items.map((item) => <div className="state-row" key={item.name}><strong>{item.name}</strong><b>{item.days} <small>days</small></b><RiskBadge tone={item.risk} /></div>)}</div>;
}

function Simulator({ data, onHorizon, busy, onNavigate }) {
  const [choice, setChoice] = useState('recommended');
  const scenarios = [data.scenarios.single, data.scenarios.recommended];
  return <>
    <PageHeading eyebrow="RIPPLE SIMULATION" title="Compare consequence before action" copy="See the regional effect of a transfer before a human approves it." action={<button className="button button-primary" onClick={() => onNavigate('plan')}>Review recommended plan <Icon name="arrow" /></button>} />
    <section className="sim-controls"><div><h2>Simulation horizon</h2><p>Projection recalculates demand, replenishment, and donor safety.</p></div><div className="segmented" role="group" aria-label="Simulation horizon">{[7, 14, 30].map((horizon) => <button className={data.horizon === horizon ? 'selected' : ''} onClick={() => onHorizon(horizon)} disabled={busy} key={horizon}>{horizon} days</button>)}</div><span className="confidence-chip"><Icon name="shield" />{data.impact.confidence}</span></section>
    <section className="scenario-grid">{scenarios.map((scenario, index) => <article className={`scenario-card ${scenario.tone} ${choice === scenario.id ? 'selected' : ''}`} key={scenario.id}><div className="scenario-head"><div><span>SIMULATION {String.fromCharCode(65 + index)}</span><h2>{scenario.title}</h2><p>{scenario.source}</p></div><RiskBadge tone={scenario.tone}>{scenario.status}</RiskBadge></div><p className="scenario-copy">{scenario.copy}</p><div className="state-compare"><StateBlock label="Before transfer" items={scenario.before} /><Icon name="arrow" /><StateBlock label="After transfer" items={scenario.after} /></div><div className="scenario-result"><Icon name={scenario.tone === 'healthy' ? 'check' : 'alert'} /><div><span>Result state</span><strong>{scenario.result}</strong></div></div><button className="scenario-select" onClick={() => setChoice(scenario.id)}>{choice === scenario.id ? 'Selected for review' : 'Select to compare'}<Icon name={choice === scenario.id ? 'check' : 'chevron'} /></button></article>)}</section>
    <section className="impact-card"><div><span className="eyebrow">PROJECTED IMPACT DIFFERENCE</span><h2>The safe split reduces exposure without creating a future shortage.</h2><p>{data.impact.notes}</p></div><div className="impact-stat"><span>Patient-days at risk saved</span><strong>{data.impact.saved}<small>days</small></strong><RiskBadge tone="healthy">Improved resilience</RiskBadge></div><div className="impact-stat"><span>New-risk warnings created</span><strong>{data.impact.warnings}<small>states</small></strong><RiskBadge tone="healthy">No donor stockout</RiskBadge></div></section>
  </>;
}

function PlanReview({ data, onDecision, decisionBusy, onNavigate }) {
  const [note, setNote] = useState('');
  const isResolved = data.status === 'approved' || data.status === 'rejected';
  return <>
    <PageHeading eyebrow="PLAN REVIEW" title="Recommended transfer plan" copy={`${data.target} · ${data.medicine} · ${data.presentation}`} action={<RiskBadge tone={data.status === 'approved' ? 'healthy' : data.status === 'rejected' ? 'critical' : 'watch'}>{isResolved ? data.status : 'Awaiting human approval'}</RiskBadge>} />
    <section className="clinical-banner"><span><Icon name="shield" /></span><div><strong>Clinical verification check required</strong><p>{data.warning}</p></div></section>
    <section className="plan-layout"><div className="plan-main"><div className="section-heading"><span>SAFE SOURCING ROUTE</span><h2>Instruction set</h2><p>{data.rationale}</p></div><div className="transfer-list">{data.transfers.map((transfer, index) => <article className="transfer-row" key={transfer.source}><div className="transfer-number">{index + 1}</div><div className="transfer-source"><small>SOURCE {index + 1}</small><h3>{transfer.source}</h3><p>Deliver {transfer.quantity} {data.unit} of {data.medicine}</p><span>{transfer.constraint}</span></div><div className="transfer-quantity"><strong>{transfer.quantity}</strong><span>{data.unit}</span><small>{transfer.distance}</small></div><div className="remaining-stock"><span>Remaining safe stock</span><strong>{transfer.remaining} {data.unit}</strong></div></article>)}</div></div><aside className="plan-summary"><h2>Execution summary</h2><dl><div><dt>Total sourced</dt><dd>{data.summary.total} {data.summary.unit}</dd></div><div><dt>New projected life</dt><dd className="good">{data.summary.projectedLife}</dd></div><div><dt>Uncertainty factor</dt><dd className="watch-text">{data.summary.uncertainty}</dd></div><div><dt>New stockouts</dt><dd className="good">{data.summary.noNewStockouts ? 'None projected' : 'Review required'}</dd></div></dl><div className="approval-note"><label htmlFor="approval-note">Approval note <small>optional</small></label><textarea id="approval-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an operational note for the audit trail" disabled={isResolved} /></div>{isResolved ? <div className={`decision-result ${data.status}`}><Icon name={data.status === 'approved' ? 'check' : 'close'} /><div><strong>Plan {data.status}</strong><span>The decision was added to the immutable audit trail.</span></div></div> : <div className="decision-actions"><button className="button button-primary" disabled={decisionBusy} onClick={() => onDecision('approved', note)}>{decisionBusy ? 'Recording decision…' : 'Approve transfers'}<Icon name="check" /></button><button className="button button-danger" disabled={decisionBusy} onClick={() => onDecision('rejected', note)}>Reject & re-route</button></div>}<button className="audit-link" onClick={() => onNavigate('audit')}>View decision record <Icon name="arrow" /></button></aside></section>
  </>;
}

function AuditTrail({ rows }) {
  return <>
    <PageHeading eyebrow="ACCOUNTABILITY" title="Immutable ledger & audit trail" copy="Every alert, scenario, and human decision is retained with its source and timestamp." action={<button className="button button-secondary">All events <Icon name="chevron" /></button>} />
    <section className="audit-summary"><div className="audit-summary-icon"><Icon name="clipboard" /></div><div><span>ACTIVE SCENARIO</span><h2>Chennai Central stockout prevention</h2><p>Human Insulin 100 IU/mL · safe multi-source transfer under review.</p></div><RiskBadge tone="critical">Action required</RiskBadge></section>
    <section className="audit-card"><div className="audit-table-heading"><div><h2>Historical operations log</h2><p>Records are appended when a decision is made; demo data can be replaced by the backend audit endpoint.</p></div><span>{rows.length} events</span></div><div className="audit-list">{rows.map((row) => <article className="audit-row" key={row.id}><div className={`audit-event-icon ${row.status}`}><Icon name={row.status === 'approved' ? 'check' : row.status === 'critical' ? 'alert' : row.status === 'watch' ? 'clock' : 'activity'} /></div><div className="audit-event"><h3>{row.event}</h3><p>{row.detail}</p><small>{row.meta}</small></div><div className="audit-actor"><strong>{row.actor}</strong><span>{row.source}</span></div><div className="audit-time"><span>{row.at}</span><small>ID: #{row.id}</small></div><RiskBadge tone={row.status === 'approved' ? 'healthy' : row.status === 'critical' || row.status === 'rejected' ? 'critical' : 'watch'}>{row.status.replace('-', ' ')}</RiskBadge></article>)}</div></section>
  </>;
}

function App() {
  const [view, setView] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({});
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [dashboard, facility, candidates, simulation, plan, audit] = await Promise.all([medrippleApi.getDashboard(), medrippleApi.getFacility(), medrippleApi.getCandidates(), medrippleApi.simulate(), medrippleApi.getPlan(), medrippleApi.getAudit()]);
      setPayload({ dashboard, facility, candidates, simulation, plan, audit });
    } catch (err) {
      setError(err.message || 'We could not load the regional workspace.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 3600); return () => window.clearTimeout(timer); }, [toast]);

  const onHorizon = async (horizon) => {
    if (horizon === payload.simulation?.horizon) return;
    setSimulationBusy(true);
    try {
      const nextSimulation = await medrippleApi.simulate({ horizon });
      setPayload((current) => ({ ...current, simulation: nextSimulation }));
    }
    catch (err) { setToast(err.message || 'Could not refresh the simulation.'); }
    finally { setSimulationBusy(false); }
  };

  const onDecision = async (decision, note) => {
    setDecisionBusy(true);
    try {
      const response = await medrippleApi.decidePlan({ planId: payload.plan.id, decision, note });
      const rows = await medrippleApi.getAudit();
      setPayload((current) => ({ ...current, plan: response, audit: rows }));
      setToast(`Plan ${decision}; an audit record was created.`);
    } catch (err) { setToast(err.message || 'The decision could not be recorded.'); }
    finally { setDecisionBusy(false); }
  };

  const content = useMemo(() => {
    if (!payload.dashboard) return null;
    if (view === 'facility') return <FacilityDetail data={payload.facility} onNavigate={setView} />;
    if (view === 'candidates') return <Candidates data={payload.candidates} onNavigate={setView} />;
    if (view === 'simulator') return <Simulator data={payload.simulation} onHorizon={onHorizon} busy={simulationBusy} onNavigate={setView} />;
    if (view === 'plan') return <PlanReview data={payload.plan} onDecision={onDecision} decisionBusy={decisionBusy} onNavigate={setView} />;
    if (view === 'audit') return <AuditTrail rows={payload.audit} />;
    return <Dashboard data={payload.dashboard} onNavigate={setView} />;
  }, [view, payload, simulationBusy, decisionBusy]);

  if (loading) return <div className="initial-state"><div className="loading-logo"><Icon name="ripple" size={28} /></div><strong>Loading MEDRIPPLE</strong><span>Preparing your regional resilience snapshot…</span></div>;
  if (error) return <div className="error-page"><EmptyOrError title="Regional workspace unavailable" copy={error} onRetry={load} /></div>;

  return <><AppShell active={view} onNavigate={setView} menuOpen={menuOpen} setMenuOpen={setMenuOpen} snapshotAt={payload.dashboard?.snapshotAt} dateLabel={payload.dashboard?.dateLabel}>{content}</AppShell>{toast && <div className="toast" role="status"><Icon name="check" />{toast}<button aria-label="Dismiss" onClick={() => setToast('')}><Icon name="close" size={16} /></button></div>}</>;
}

export default App;
