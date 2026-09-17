import { useEffect, useMemo, useRef, useState } from 'react';
import './auth.css';
import { Icon } from './components/Icon';
import { AuthScreen } from './components/AuthScreen';
import { medrippleApi } from './services/medrippleApi';

const navItems = [
  ['dashboard', 'dashboard', 'grid'],
  ['facility', 'facility detail', 'building'],
  ['candidates', 'candidates', 'users'],
  ['simulator', 'ripple simulator', 'ripple'],
  ['plan', 'plan review', 'clipboard'],
  ['audit', 'audit trail', 'activity'],
];

const riskLabels = { healthy: 'healthy', watch: 'watch', critical: 'critical', approved: 'approved', rejected: 'rejected' };

function RiskPill({ tone = 'watch', children }) {
  return <span className={`risk-pill ${tone}`}>{children || riskLabels[tone] || tone}</span>;
}

function Button({ children, primary = false, className = '', ...props }) {
  return <button className={`mr-button ${primary ? 'primary' : ''} ${className}`} {...props}>{children}</button>;
}

function Card({ className = '', children }) {
  return <section className={`mr-card ${className}`}>{children}</section>;
}

function Stat({ label, value, detail, tone = '' }) {
  return <article className="mr-stat">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small className={tone}>{detail}</small>}
  </article>;
}

function PageHead({ eyebrow, title, copy, action }) {
  return <div className="page-head">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{copy && <p className="page-copy">{copy}</p>}</div>
    {action && <div className="page-action">{action}</div>}
  </div>;
}

function EmptyOrError({ title, copy, retry }) {
  return <section className="empty-state" role="alert"><Icon name="alert" size={24} /><h1>{title}</h1><p>{copy}</p>{retry && <Button primary onClick={retry}>try again</Button>}</section>;
}

function Shell({ active, onNavigate, children, menuOpen, setMenuOpen, snapshotAt, dateLabel, user, onSignOut, facilityCount }) {
  const current = navItems.find(([id]) => id === active)?.[1] || 'dashboard';
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'MR';
  return <div className="workspace-shell">
    <aside className={`workspace-sidebar ${menuOpen ? 'open' : ''}`} aria-label="primary navigation">
      <div className="brand-row"><div className="brand-icon"><Icon name="ripple" size={18} /></div><div><strong>medripple</strong><span>care, connected.</span></div><button className="menu-close" aria-label="close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button></div>
      <p className="nav-label">workspace</p>
      <nav>{navItems.map(([id, label, icon]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => { onNavigate(id); setMenuOpen(false); }}><Icon name={icon} size={16} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer"><p><i />network snapshot</p><small>{facilityCount} facilities · refreshes every 30s</small><div className="profile"><div>{initials}</div><p><strong>{user?.name || 'workspace user'}</strong><small>{user?.role?.toLowerCase() || 'operator'} account</small></p><button className="sign-out" type="button" onClick={onSignOut} aria-label="sign out"><Icon name="logout" size={15} /></button></div></div>
    </aside>
    {menuOpen && <button className="sidebar-backdrop" aria-label="close navigation" onClick={() => setMenuOpen(false)} />}
    <main className="workspace-main">
      <header className="workspace-topbar"><button className="menu-open" aria-label="open navigation" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><p>workspace <Icon name="chevron" size={12} /> <strong>{current}</strong></p><div><span className="top-pill"><i />simulated decision support</span><span className="top-pill">{dateLabel || 'live fixture'}</span></div></header>
      <div className="workspace-page">{children}</div>
      <footer>prototype decision support - all transfers require human approval.<span>snapshot: {snapshotAt || 'loading'}</span></footer>
    </main>
  </div>;
}

function Dashboard({ data, onNavigate }) {
  const atRisk = data.facilities.filter((facility) => facility.risk !== 'healthy').length;
  const resilience = data.metrics.find((metric) => metric.label.toLowerCase().includes('resilience'));
  const earliest = data.metrics.find((metric) => metric.label.toLowerCase().includes('earliest'));
  const patientDays = data.metrics.find((metric) => metric.label.toLowerCase().includes('patient'));
  return <>
    <PageHead eyebrow="regional overview" title="Network resilience at a glance" copy={`${data.facilities.length} facilities · ${data.snapshotAt.toLowerCase()}`} action={<Button onClick={() => onNavigate('facility')}>view all facilities</Button>} />
    <div className="stat-grid four">
      <Stat label="resilience score" value={resilience?.value || '—'} detail={resilience?.detail} tone={resilience?.tone} />
      <Stat label="facilities at risk" value={String(atRisk)} detail={`of ${data.facilities.length} connected`} tone={atRisk ? 'watch' : 'healthy'} />
      <Stat label="earliest stockout" value={`${earliest?.value || '—'} ${earliest?.unit || ''}`} detail={earliest?.detail} tone="critical" />
      <Stat label="patient-days at risk" value={patientDays?.value || '—'} detail={patientDays?.detail} tone="watch" />
    </div>
    <Card className="facility-status"><h2>facility status</h2><div className="table-wrap"><table><thead><tr><th>facility</th><th>medicine</th><th>coverage</th><th>state</th></tr></thead><tbody>{data.facilities.map((facility) => <tr key={facility.id}><td><button className="facility-link" onClick={() => onNavigate('facility')}>{facility.name}</button></td><td>{facility.medicine}</td><td>{facility.days} days</td><td><span className={`state-dot ${facility.risk}`}>● {riskLabels[facility.risk]}</span></td></tr>)}</tbody></table></div></Card>
  </>;
}

function ForecastChart({ values }) {
  const max = Math.max(100, ...values);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${88 - (value / max) * 74}`).join(' ');
  return <div className="forecast-chart" aria-label="fourteen day effective stock forecast"><span className="safety-line">safety stock</span><span className="stockout-line">projected stockout</span><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" x2="100" y1="48" y2="48" /><polyline points={points} /></svg><div><span>today</span><span>day 3</span><span>day 7</span><span>day 14</span></div></div>;
}

function Facility({ data, onNavigate }) {
  return <>
    <PageHead eyebrow="facility intelligence" title={data.name} copy={`${data.type} · ${data.region}`} action={<Button onClick={() => onNavigate('candidates')}>view safe candidates</Button>} />
    <section className="risk-banner"><div><span>active medicine risk</span><h2>{data.medicine}</h2><p>{data.presentation} · {data.freshness}</p></div><div><span>risk score</span><strong>{data.riskScore}<small>/100</small></strong><RiskPill tone={data.risk}>critical</RiskPill></div></section>
    <div className="stat-grid four facility-stats"><Stat label="effective stock" value={`${data.effectiveStock} ${data.unit}`} detail="usable, compatible, and in-date" /><Stat label="daily demand" value={`${data.dailyDemand} ${data.unit}/day`} detail="forecasted average consumption" /><Stat label="incoming supply" value={`${data.incomingSupply.amount} ${data.unit}`} detail={`${data.incomingSupply.status}, ${data.incomingSupply.eta}`} tone="watch" /><Stat label="coverage remaining" value={`${data.daysRemaining} days`} detail="below the 4-day threshold" tone="critical" /></div>
    <div className="detail-grid"><Card><div className="card-heading"><div><h2>forecast timeline</h2><p>projected usable stock through the next 14 days</p></div><span>— effective stock</span></div><ForecastChart values={data.series} /><div className="warning-note"><strong>projected stockout in {data.daysRemaining} days</strong><p>replenishment is expected after the projected stockout date.</p></div></Card><Card className="evidence"><h2>why this is flagged</h2><div><span>primary cause</span><strong>{data.cause}</strong><p>{data.explanation}</p></div><div><span>forecast confidence</span><strong>{data.confidence}</strong><p>{data.confidenceReason}</p></div><div><span>data freshness</span><strong>current inventory signal</strong><p>{data.freshness}</p></div></Card></div>
    <Card className="workflow"><div><p className="eyebrow">safe workflow</p><h2>resolve this alert in three clear steps</h2></div><ol>{data.nextSteps.map((step, index) => <li key={step}><b>{index + 1}</b>{step}</li>)}</ol><Button primary onClick={() => onNavigate('candidates')}>review candidates</Button></Card>
  </>;
}

function Candidates({ data, onNavigate }) {
  const candidateCount = data.rows.filter((row) => row.eligible).length;
  const unit = data.unit || 'units';
  return <>
    <PageHead eyebrow="transfer safety" title="Eligible donor candidates" copy={`safe options for ${data.target} · ${data.medicine}`} action={<Button primary onClick={() => onNavigate('simulator')}>simulate best transfer <Icon name="arrow" size={14} /></Button>} />
    <section className="info-banner warning"><div>!</div><p><strong>downstream ripple danger identified</strong>sourcing exclusively from one donor is discouraged. it may solve today's shortage while breaching that facility's protected safety stock. multi-source selection is recommended.</p></section>
    <div className="stat-grid three"><Stat label="requested coverage" value={`${data.request} ${unit}`} detail="to restore a 7-day safe buffer" /><Stat label="safe capacity found" value={`${data.safeCapacity ?? 0} ${unit}`} detail={`across ${candidateCount} viable source facilities`} tone="healthy" /><Stat label="protected sites" value={`${data.protectedCount ?? 0} blocked`} detail="safety or expiry constraint applied" tone="critical" /></div>
    <Card className="assessment"><div className="card-heading"><div><h2>donor assessment</h2><p>exact presentation matching, safety stock, route conditions, and expiry are checked for every option.</p></div><RiskPill tone="watch">human review required</RiskPill></div><div className="table-wrap"><table><thead><tr><th>facility / distance</th><th>stock level</th><th>safe surplus</th><th>cold chain and expiry</th><th>feasibility</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><strong>{row.facility}</strong><small>{row.distance} away · {row.type}</small></td><td>{row.stock} {unit}</td><td className={row.eligible ? 'good' : ''}>+{row.surplus} safe {unit}</td><td><strong>{row.chain}</strong><small>expires {row.expiry}</small></td><td><RiskPill tone={row.eligible ? 'healthy' : 'critical'}>{row.eligible ? 'safe candidate' : 'rejected'}</RiskPill><small>{row.reason}</small></td></tr>)}</tbody></table></div></Card>
    <div className="inline-cta"><p><Icon name="shield" size={16} /><span><strong>why candidates can be rejected</strong>every source must retain protected coverage; compatible stock must arrive safely before its expiry.</span></p><Button primary onClick={() => onNavigate('simulator')}>compare safe plan</Button></div>
  </>;
}

function FacilityState({ label, entries }) {
  return <div className="scenario-state"><span>{label}</span>{entries.map((entry) => <p key={entry.name}><strong>{entry.name}</strong><b>{entry.days} days</b><RiskPill tone={entry.risk} /></p>)}</div>;
}

function NoSafePlan({ data, busy, onHorizon, onQuantity, onNavigate }) {
  const details = data.details || {};
  const unit = details.unit || 'units';
  return <>
    <PageHead eyebrow="safety assessment complete" title="No safe plan for this request" copy={`Requested ${data.quantity} ${unit} over ${data.horizon} days. The service is working; this request does not meet the safety constraints.`} />
    <Card className="simulation-controls"><div><h2>simulation horizon</h2><p>A shorter horizon is a different assessment, not a safety override.</p></div><div className="horizon-switch">{[7, 14, 30].map((days) => <button key={days} className={data.horizon === days ? 'active' : ''} disabled={busy} onClick={() => onHorizon(days)}>{days} days</button>)}</div></Card>
    <section className="info-banner warning" role="status"><Icon name="shield" /><p><strong>Donor stock remains protected</strong>{details.explanation || data.message} No transfer was approved or stock moved by this assessment.</p></section>
    <div className="stat-grid three"><Stat label="requested quantity" value={`${data.quantity} ${unit}`} /><Stat label="safe donor capacity" value={Number.isFinite(details.safeCapacity) ? `${details.safeCapacity} ${unit}` : 'Unavailable'} /><Stat label="unmet quantity" value={Number.isFinite(details.unmetQuantity) ? `${details.unmetQuantity} ${unit}` : 'Unavailable'} /></div>
    <Card><h2>Review the request</h2><form onSubmit={(event) => { event.preventDefault(); onQuantity(Number(new FormData(event.currentTarget).get('quantity'))); }}><label>Quantity ({unit}) <input key={data.quantity} name="quantity" type="number" min="0.01" step="0.01" defaultValue={data.quantity} required disabled={busy} /></label> <Button type="submit" primary disabled={busy}>{busy ? 'checking safety…' : 'simulate this quantity'}</Button></form><p>Changing the quantity does not approve a transfer. Every new result must pass the same checks.</p></Card>
    {(details.recommendedEscalation || []).length > 0 && <Card><h2>Suggested next steps</h2><ul>{details.recommendedEscalation.map((item) => <li key={item}>{item}</li>)}</ul></Card>}
    <div className="inline-cta"><Button disabled={busy} onClick={() => onQuantity(data.quantity)}>recheck current inventory</Button><Button onClick={() => onNavigate('candidates')}>review donor constraints</Button></div>
  </>;
}

function Simulator({ data, busy, onHorizon, onQuantity, onNavigate }) {
  if (data.noSafePlan) return <NoSafePlan data={data} busy={busy} onHorizon={onHorizon} onQuantity={onQuantity} onNavigate={onNavigate} />;
  const scenarios = [data.scenarios.single, data.scenarios.recommended];
  return <>
    <PageHead eyebrow="ripple simulation" title="Compare consequence before action" copy="see the regional effect of a transfer before a human approves it." action={<Button primary onClick={() => onNavigate('plan')}>review recommended plan <Icon name="arrow" size={14} /></Button>} />
    <Card className="simulation-controls"><div><h2>simulation horizon</h2><p>projection recalculates demand, replenishment, and donor safety.</p></div><div className="horizon-switch">{[7, 14, 30].map((days) => <button className={data.horizon === days ? 'active' : ''} key={days} disabled={busy} onClick={() => onHorizon(days)}>{days} days</button>)}</div><RiskPill tone="watch"><Icon name="shield" size={12} />{data.impact.confidence}</RiskPill></Card>
    <section className="scenario-grid">{scenarios.map((scenario, index) => <Card key={scenario.id} className={`scenario ${scenario.tone}`}><div className="scenario-head"><span>simulation {String.fromCharCode(65 + index)}</span><RiskPill tone={scenario.tone}>{scenario.status.toLowerCase()}</RiskPill></div><h2>{scenario.title.toLowerCase()}</h2><p className="muted">{scenario.source}</p><p className="scenario-copy">{scenario.copy}</p><div className="scenario-compare"><FacilityState label="before transfer" entries={scenario.before} /><Icon name="arrow" size={16} /><FacilityState label="after transfer" entries={scenario.after} /></div><p className={`scenario-result ${scenario.tone}`}>result: {scenario.result.toLowerCase()}</p></Card>)}</section>
    <section className="impact-banner"><div><p>projected impact difference</p><h2>the safe split reduces exposure without creating a future shortage.</h2><small>{data.impact.notes}</small></div><div><span>patient-days at risk saved</span><strong>{data.impact.saved} days</strong><span>new-risk warnings created</span><strong>{data.impact.warnings} states</strong></div></section>
  </>;
}

function Plan({ data, onDecision, onLifecycle, decisionBusy, onNavigate, canApprove }) {
  const [note, setNote] = useState('');
  const isProposed = data.status === 'proposed';
  const terminal = ['approved', 'rejected', 'cancelled', 'delivered'].includes(data.status);
  const lifecycleCopy = {
    approved: ['approved', 'The simulated fixture plan was approved and recorded in the audit trail.'],
    reserved: ['stock reserved', 'Donor stock is reserved. Confirm dispatch when the shipment leaves the facility.'],
    in_transit: ['in transit', 'Shipment is in transit. Confirm delivery only after receipt is verified.'],
    delivered: ['delivered', 'The recipient inventory and audit trail were updated after delivery.'],
    cancelled: ['cancelled', 'The reservation was released and donor stock was restored.'],
    rejected: ['rejected', 'The decision was appended to the audit trail.'],
  };
  const lifecycle = lifecycleCopy[data.status];
  return <>
    <PageHead eyebrow="plan review" title="Recommended transfer plan" copy={`${data.target} · ${data.medicine} · ${data.presentation}`} action={<RiskPill tone={data.status === 'approved' ? 'healthy' : data.status === 'rejected' ? 'critical' : 'watch'}>{terminal ? data.status : 'awaiting human approval'}</RiskPill>} />
    <section className="info-banner success"><Icon name="shield" /><p><strong>clinical verification check required</strong>{data.warning}</p></section>
    <div className="plan-grid"><Card className="instruction-card"><p className="eyebrow">safe sourcing route</p><h2>instruction set</h2><p className="muted">{data.rationale}</p>{data.transfers.map((transfer, index) => <article className="transfer" key={transfer.source}><b>{index + 1}</b><div><span>source {index + 1}</span><h3>{transfer.source}</h3><p>deliver {transfer.quantity} {data.unit} of {data.medicine}</p><small>{transfer.constraint}</small></div><div><strong>{transfer.quantity}<small> {data.unit}</small></strong><span>{transfer.distance}</span><small>remaining safe stock <b>{transfer.remaining} {data.unit}</b></small></div></article>)}</Card><Card className="plan-summary"><h2>execution summary</h2><dl><div><dt>total sourced</dt><dd>{data.summary.total} {data.summary.unit}</dd></div><div><dt>new projected life</dt><dd className="good">{data.summary.projectedLife}</dd></div><div><dt>uncertainty factor</dt><dd className="watch-text">{data.summary.uncertainty}</dd></div><div><dt>new stockouts</dt><dd>{data.summary.noNewStockouts ? 'none projected' : 'review required'}</dd></div></dl><label>operational note <small>required for decisions and lifecycle events</small><textarea value={note} disabled={terminal || !canApprove} onChange={(event) => setNote(event.target.value)} placeholder="record the approval, dispatch, delivery, or cancellation reason" /></label>{terminal ? <div className={`decision ${data.status}`}><Icon name={data.status === 'delivered' ? 'check' : 'close'} /><strong>plan {lifecycle?.[0] || data.status}</strong><span>{lifecycle?.[1]}</span></div> : !canApprove ? <div className="role-notice"><Icon name="shield" /><div><strong>approver role required</strong><span>operator accounts can review plans but cannot approve, dispatch, deliver, or cancel them.</span></div></div> : isProposed ? <div className="plan-actions"><Button primary disabled={decisionBusy} onClick={() => onDecision('approved', note)}>{decisionBusy ? 'recording decision…' : 'approve and reserve stock ✓'}</Button><Button disabled={decisionBusy} className="danger" onClick={() => onDecision('rejected', note)}>reject and re-route</Button></div> : data.status === 'reserved' ? <div className="plan-actions"><Button primary disabled={decisionBusy} onClick={() => onLifecycle('DISPATCH', note)}>{decisionBusy ? 'recording dispatch…' : 'confirm dispatch →'}</Button><Button disabled={decisionBusy} className="danger" onClick={() => onLifecycle('CANCEL', note)}>cancel and release stock</Button></div> : <div className="plan-actions"><Button primary disabled={decisionBusy} onClick={() => onLifecycle('DELIVER', note)}>{decisionBusy ? 'recording delivery…' : 'confirm delivery ✓'}</Button></div>}<button className="record-link" onClick={() => onNavigate('audit')}>view decision record →</button></Card></div>
  </>;
}

function Audit({ rows }) {
  return <>
    <PageHead eyebrow="accountability" title="Immutable ledger and audit trail" copy="every alert, scenario, and human decision is retained with its source and timestamp." action={<button className="record-link">all events →</button>} />
    <Card className="active-scenario"><div className="file-icon"><Icon name="clipboard" /></div><div><p className="eyebrow">active scenario</p><h2>Navjeevan PHC stockout prevention</h2><p>Human insulin 100 IU/mL · safe multi-source transfer under review.</p></div><RiskPill tone="critical">action required</RiskPill></Card>
    <Card className="audit-card"><div className="card-heading"><div><h2>historical operations log</h2><p>records are appended when a decision is made; the API is the source of truth for the audit ledger.</p></div><span className="muted">{rows.length} events</span></div>{rows.length ? <div className="audit-list">{rows.map((row) => <article key={row.id}><div className={`audit-icon ${row.status}`}><Icon name={row.status === 'approved' ? 'check' : row.status === 'rejected' ? 'close' : 'activity'} /></div><div><h3>{row.event}</h3><p>{row.detail}</p><small>{row.meta}</small></div><div><strong>{row.actor}</strong><small>{row.source}</small></div><div><span>{row.at}</span><small>id: {row.id}</small></div><RiskPill tone={row.status === 'approved' ? 'healthy' : row.status === 'rejected' || row.status === 'critical' ? 'critical' : 'watch'}>{row.status}</RiskPill></article>)}</div> : <div className="empty-audit"><Icon name="clipboard" /><p>no decisions recorded yet</p><small>approving or rejecting a plan adds a timestamped human-decision event here.</small></div>}</Card>
  </>;
}

function App() {
  const [view, setView] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState({});
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [viewErrors, setViewErrors] = useState({});
  const [retryVersion, setRetryVersion] = useState(0);
  const refreshInFlight = useRef(false);

  const load = async (background = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!background) setLoading(true);
    setError('');
    try {
      const dashboard = await medrippleApi.getDashboard();
      setPayload((current) => ({ ...current, dashboard }));
    } catch (err) {
      if (err.status === 401) setUser(null);
      else if (background) setToast(`Refresh failed: ${err.message}. Displayed data may be stale.`);
      else setError(err.message || 'we could not load the regional workspace.');
    } finally { setLoading(false); refreshInFlight.current = false; }
  };

  useEffect(() => {
    let active = true;
    medrippleApi.restoreSession()
      .then((sessionUser) => { if (active) setUser(sessionUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (user) load(); }, [user]);
  useEffect(() => {
    if (!user) return undefined;
    const refresh = () => { if (!document.hidden) load(true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [user]);
  useEffect(() => {
    if (!user || view === 'dashboard') return undefined;
    let active = true;
    const key = view === 'simulator' ? 'simulation' : view;
    const loaders = { facility: () => medrippleApi.getFacility(), candidates: () => medrippleApi.getCandidates(), simulation: () => medrippleApi.simulate({ horizon: payload.simulation?.horizon || 14, quantity: payload.simulation?.quantity || 45 }), plan: () => medrippleApi.getPlan(), audit: () => medrippleApi.getAudit() };
    setViewErrors((current) => ({ ...current, [key]: '' }));
    loaders[key]().then((value) => {
      if (active) setPayload((current) => ({ ...current, [key]: value }));
    }).catch((err) => {
      if (active) setViewErrors((current) => ({ ...current, [key]: err.message }));
    });
    return () => { active = false; };
  }, [user, view, retryVersion]);
  useEffect(() => { if (!toast) return undefined; const timeout = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timeout); }, [toast]);

  const onAuthenticated = (sessionUser) => {
    setView('dashboard');
    setPayload({});
    setError('');
    setLoading(true);
    setUser(sessionUser);
  };

  const onSignOut = async () => {
    await medrippleApi.logout();
    setUser(null);
    setPayload({});
    setError('');
    setToast('');
  };

  const changeHorizon = async (horizon) => {
    if (horizon === payload.simulation?.horizon) return;
    setSimulationBusy(true);
    try { const simulation = await medrippleApi.simulate({ horizon, quantity: payload.simulation?.quantity || 45 }); setPayload((current) => ({ ...current, simulation })); } catch (err) { setToast(err.message || 'could not refresh the simulation.'); } finally { setSimulationBusy(false); }
  };

  const changeQuantity = async (quantity, horizon = payload.simulation?.horizon || 14) => {
    if (!Number.isFinite(quantity) || quantity <= 0) { setToast('Enter a positive quantity.'); return; }
    setSimulationBusy(true);
    try { const simulation = await medrippleApi.simulate({ horizon, quantity }); setPayload((current) => ({ ...current, simulation })); } catch (err) { setToast(err.message || 'could not refresh the simulation.'); } finally { setSimulationBusy(false); }
  };

  const decide = async (decision, note) => {
    setDecisionBusy(true);
    try { const plan = await medrippleApi.decidePlan({ planId: payload.plan.id, decision, note }); const audit = await medrippleApi.getAudit(); setPayload((current) => ({ ...current, plan, audit })); setToast(`plan ${decision}; an audit record was created.`); } catch (err) { setToast(err.code === 'PLAN_STOCK_CHANGED' ? 'conditions changed; please refresh and re-run the optimizer.' : err.message || 'the decision could not be recorded.'); } finally { setDecisionBusy(false); }
  };

  const transitionPlan = async (action, note) => {
    setDecisionBusy(true);
    try { const plan = await medrippleApi.transitionPlan({ planId: payload.plan.id, action, note }); const audit = await medrippleApi.getAudit(); setPayload((current) => ({ ...current, plan, audit })); setToast(`plan ${action.toLowerCase()} recorded; an audit record was created.`); } catch (err) { setToast(err.code === 'PLAN_STOCK_CHANGED' ? 'conditions changed; please refresh and re-run the optimizer.' : err.message || 'the lifecycle event could not be recorded.'); } finally { setDecisionBusy(false); }
  };

  const page = useMemo(() => {
    if (!payload.dashboard) return null;
    const key = view === 'simulator' ? 'simulation' : view;
    if (viewErrors[key]) return <EmptyOrError title="This section is temporarily unavailable" copy={viewErrors[key]} retry={() => setRetryVersion((current) => current + 1)} />;
    if (payload[key] === undefined) return <p role="status">Loading {view} from the backend…</p>;
    if (view === 'facility') return <Facility data={payload.facility} onNavigate={setView} />;
    if (view === 'candidates') return <Candidates data={payload.candidates} onNavigate={setView} />;
    if (view === 'simulator') return <Simulator data={payload.simulation} busy={simulationBusy} onHorizon={changeHorizon} onQuantity={changeQuantity} onNavigate={setView} />;
    if (view === 'plan' && payload.plan.noSafePlan) return <EmptyOrError title="No new safe plan is available" copy="The default 45-unit, 14-day request does not pass donor safety checks. Open the ripple simulator to see safe capacity and assess another quantity or horizon." retry={() => setView('simulator')} />;
    if (view === 'plan') return <Plan data={payload.plan} decisionBusy={decisionBusy} onDecision={decide} onLifecycle={transitionPlan} onNavigate={setView} canApprove={['APPROVER', 'ADMIN'].includes(user?.role)} />;
    if (view === 'audit') return <Audit rows={payload.audit} />;
    return <Dashboard data={payload.dashboard} onNavigate={setView} />;
  }, [view, payload, viewErrors, simulationBusy, decisionBusy, user]);

  if (!authReady || loading || (user && !payload.dashboard && !error)) return <div className="app-state"><Icon name="ripple" size={28} /><strong>loading medripple</strong><span>preparing your regional resilience snapshot…</span></div>;
  if (!user) return <AuthScreen api={medrippleApi} onAuthenticate={onAuthenticated} />;
  if (error) return <div className="app-state"><EmptyOrError title="regional workspace unavailable" copy={error} retry={() => load()} /><Button onClick={onSignOut}>sign out</Button></div>;
  return <><Shell active={view} onNavigate={setView} menuOpen={menuOpen} setMenuOpen={setMenuOpen} snapshotAt={payload.dashboard.snapshotAt} dateLabel={payload.dashboard.dateLabel} facilityCount={payload.dashboard.facilities.length} user={user} onSignOut={onSignOut}>{page}</Shell>{toast && <div className="toast"><Icon name="check" size={15} />{toast}<button onClick={() => setToast('')} aria-label="dismiss"><Icon name="close" size={14} /></button></div>}</>;
}

export default App;
