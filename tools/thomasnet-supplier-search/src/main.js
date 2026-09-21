import './style.css';

const searchModes = {
  requirements: {
    tab: 'By requirement',
    kicker: 'Supplier query',
    label: 'What do you need sourced?',
    prefix: 'I need',
    placeholder: '10,000 anodized aluminum brackets, AS9100 certified, delivered to Detroit within 6 weeks',
    action: 'Find matching suppliers',
    guidance: ['material', 'quantity', 'certification', 'location', 'lead time'],
    intro: 'Start from a sourcing example',
    examples: [
      ['CNC machining', 'ISO 9001 CNC machining for aerospace prototypes near Ohio'],
      ['Custom enclosures', 'NEMA-rated custom electrical enclosures with short lead times'],
      ['Food-grade tubing', 'FDA-compliant food-grade silicone tubing suppliers in the Midwest'],
      ['Injection molding', 'Low-volume injection molding for medical devices'],
      ['Stainless fabrication', 'ASME stainless steel fabrication and welding near Texas'],
    ],
  },
  name: {
    tab: 'By supplier name',
    kicker: 'Company lookup',
    label: 'Which supplier are you looking for?',
    prefix: 'Company',
    placeholder: 'Enter a full or partial company name, such as Acme Industrial',
    action: 'Find company profiles',
    guidance: ['company name', 'city', 'state', 'website'],
    intro: 'Recently searched companies',
    examples: [
      ['Parker Hannifin', 'Parker Hannifin suppliers and locations'],
      ['Grainger', 'W.W. Grainger company profile'],
      ['Fastenal', 'Fastenal industrial supply locations'],
      ['Emerson', 'Emerson manufacturing divisions'],
      ['3M', '3M industrial product suppliers'],
    ],
  },
  product: {
    tab: 'By product or brand',
    kicker: 'Product lookup',
    label: 'What product or brand do you need?',
    prefix: 'Find',
    placeholder: 'Product type, model, part number, or brand — for example, NEMA 4X enclosure',
    action: 'Search products',
    guidance: ['product type', 'brand', 'model', 'part number', 'specification'],
    intro: 'Popular product searches',
    examples: [
      ['Ball bearings', 'Sealed stainless steel ball bearings'],
      ['NEMA enclosures', 'NEMA 4X stainless steel electrical enclosures'],
      ['Safety valves', 'ASME pressure safety relief valves'],
      ['Servo motors', 'High-torque industrial servo motors'],
      ['3M adhesives', '3M structural bonding adhesives'],
    ],
  },
  certification: {
    tab: 'By certification',
    kicker: 'Qualified supplier lookup',
    label: 'Which qualification must the supplier hold?',
    prefix: 'Certified',
    placeholder: 'Certification plus capability or location — for example, AS9100 machine shops in Michigan',
    action: 'Find certified suppliers',
    guidance: ['AS9100', 'ISO 9001', 'IATF 16949', 'ITAR', 'minority-owned'],
    intro: 'Common qualification searches',
    examples: [
      ['AS9100', 'AS9100-certified aerospace machining suppliers'],
      ['ISO 13485', 'ISO 13485 medical device contract manufacturers'],
      ['IATF 16949', 'IATF 16949 automotive component suppliers'],
      ['ITAR', 'ITAR-registered metal fabrication companies'],
      ['Diverse suppliers', 'Women-owned and minority-owned industrial suppliers'],
    ],
  },
};

const networkStats = [
  ['500,000+', 'Supplier profiles', 'Explore more than half a million company profiles across industrial categories and regions.', '100'],
  ['72,000+', 'Certifications indexed', 'Narrow a shortlist using quality, diversity, ownership, and industry-specific credentials.', '68'],
  ['1.7M+', 'Products and capabilities', 'Search product listings and manufacturing capabilities using the language of your requirement.', '86'],
];

const supplierTypes = [
  {
    name: 'Custom manufacturers',
    description: 'Built-to-print parts, assemblies, and production runs',
    count: '42,800',
    share: '36',
    explanation: '42,800 profiles to explore when a requirement must be engineered, fabricated, or produced to specification.',
    cue: 'Best for drawings, tolerances, and production runs',
  },
  {
    name: 'Distributors',
    description: 'In-stock products, brands, and regional availability',
    count: '118,400',
    share: '100',
    explanation: '118,400 profiles to compare when availability, authorized brands, and regional fulfillment matter most.',
    cue: 'Best for stocked products and known part numbers',
  },
  {
    name: 'Service companies',
    description: 'Finishing, testing, logistics, repair, and field work',
    count: '31,600',
    share: '27',
    explanation: '31,600 profiles for the work around the product—from testing and finishing to repair and logistics.',
    cue: 'Best for specialist processes and support work',
  },
];

const browseDimensions = {
  process: {
    label: 'Process & capability',
    definition: 'A manufacturing capability describes the operation, equipment, tolerance, production volume, and secondary services a supplier can provide.',
    criteria: ['Process and equipment match', 'Tolerance and part envelope', 'Prototype or production volume', 'Lead time and service region'],
    topics: [
      ['Custom CNC machining', 'Low-volume precision parts', 'CNC machining for low-volume aerospace prototypes'],
      ['Sheet metal fabrication', 'Cutting, forming, and welding', 'Precision sheet metal fabrication with powder coating'],
      ['Medical injection molding', 'ISO 13485 production', 'ISO 13485 injection molding for medical housings'],
      ['Vacuum die casting', 'Automotive housings', 'Vacuum die casting for lightweight drivetrain housings'],
      ['Wire EDM', 'Tight-tolerance components', 'Wire EDM for hardened tool-steel components'],
    ],
  },
  certification: {
    label: 'Certification',
    definition: 'A supplier certification documents that a quality system, process, ownership status, or regulatory requirement has been independently reviewed or formally registered.',
    criteria: ['Certificate scope and expiration', 'Applicable facility location', 'Process-specific accreditation', 'Customer and regulatory requirements'],
    topics: [
      ['ITAR registration', 'Defense-controlled work', 'ITAR-registered precision machining suppliers'],
      ['AS9100', 'Aerospace quality systems', 'AS9100-certified aerospace fastener manufacturers'],
      ['FDA compliance', 'Food-contact components', 'FDA-compliant food-grade conveyor components'],
      ['UL listing', 'Industrial control panels', 'UL-listed industrial control panel builders'],
      ['NSF certification', 'Sanitary fittings', 'NSF-certified stainless steel sanitary fittings'],
    ],
  },
  material: {
    label: 'Material',
    definition: 'Material-based supplier search connects a required resin, alloy, elastomer, ceramic, or composite with the processes and operating conditions the finished part must withstand.',
    criteria: ['Grade and specification', 'Temperature and chemical exposure', 'Traceability and test reports', 'Form, thickness, and finishing'],
    topics: [
      ['Anti-vibration rubber', 'HVAC isolation mounts', 'Rubber vibration isolators for rooftop HVAC equipment'],
      ['PEEK', 'High-temperature components', 'Machined PEEK components for high-temperature applications'],
      ['Carbon fiber', 'Aerospace panels', 'Carbon fiber composite panels for aerospace structures'],
      ['Technical ceramics', 'Electrical insulation', 'Technical ceramic insulators for power electronics'],
      ['Food-grade silicone', 'Gaskets and seals', 'FDA-compliant food-grade silicone gaskets'],
    ],
  },
  industry: {
    label: 'Industry',
    definition: 'Industry-based supplier search combines the processes, materials, certifications, documentation, and regional supply requirements common to a specific end market.',
    criteria: ['Industry-specific quality system', 'Required material documentation', 'Regulatory and traceability needs', 'Relevant production experience'],
    topics: [
      ['Automotive & EV', 'IATF 16949 and high-volume production', 'EV battery enclosure and busbar manufacturers'],
      ['Aerospace & defense', 'AS9100, ITAR, and NADCAP', 'Certified aerospace machining and fastener suppliers'],
      ['Medical & pharmaceutical', 'ISO 13485 and clean production', 'Medical device component contract manufacturers'],
      ['Semiconductor', 'Cleanroom-compatible materials', 'Ultra-high-purity gas delivery component suppliers'],
      ['Food & beverage', 'FDA and NSF sanitary systems', 'Sanitary processing equipment manufacturers'],
    ],
  },
};

const industries = [
  ['Automotive & EV', 'Battery enclosures, busbars, traction-motor components, stampings, cable assemblies', 'IATF 16949', 'Michigan · Ohio · Tennessee'],
  ['Aerospace & defense', 'Airframe components, titanium machining, MIL-SPEC hardware, ruggedized enclosures', 'AS9100 · ITAR · NADCAP', 'California · Texas · Washington'],
  ['Medical & pharmaceutical', 'Thin-wall forming, micro machining, sterile packaging, sanitary process equipment', 'ISO 13485 · FDA', 'California · Massachusetts · Minnesota'],
  ['Semiconductor & electronics', 'Wafer handling, UHP gas delivery, PCBs, shielding, thermal-management parts', 'ISO 9001 · cleanroom controls', 'California · Arizona · Texas'],
  ['Energy & chemical', 'Hazardous-location motors, valves, pumps, pressure vessels, corrosion-resistant linings', 'API · ASME · UL', 'Texas · Louisiana · Pennsylvania'],
  ['Food & beverage', 'CIP systems, sanitary fittings, conveyors, food-safe seals, filling equipment', 'NSF · FDA · 3-A', 'California · Wisconsin · Pennsylvania'],
];

const sourcingSteps = [
  ['Define product requirements', 'Document drawings, specifications, materials, tolerances, volume, delivery location, and target date before searching.'],
  ['Search relevant suppliers', 'Use process, product, certification, material, and industry terms that describe the actual requirement.'],
  ['Filter capabilities', 'Remove companies without the required equipment, capacity, certifications, geography, or production volume.'],
  ['Compare qualifications', 'Compare quality systems, industries served, company size, equipment, and supporting documentation.'],
  ['Review company profiles', 'Confirm locations, ownership, contact information, product catalogs, and stated capabilities.'],
  ['Request quotes', 'Send the same requirement package to each shortlisted supplier so responses can be compared consistently.'],
  ['Evaluate price and lead time', 'Compare total cost, tooling, minimum quantities, delivery terms, and schedule risk—not unit price alone.'],
  ['Verify quality and compliance', 'Validate certificate scope, expiration dates, material traceability, inspection plans, and regulatory controls.'],
  ['Contact the shortlist', 'Ask targeted questions about capacity, similar work, subcontracted processes, and production communication.'],
  ['Select the supplier', 'Choose the supplier whose documented capability, commercial terms, delivery plan, and risk profile fit the requirement.'],
];

const faqs = [
  ['How can you find reliable suppliers for any industry?', 'Define the requirement first, search using the required process and end market, filter by documented capabilities, and verify certificates and facility details before requesting a quote.'],
  ['What criteria should you use when evaluating suppliers?', 'Evaluate process fit, equipment, capacity, certifications, quality controls, location, lead time, minimum order quantity, financial stability, and experience with comparable work.'],
  ['How can you verify a supplier before contacting them?', 'Review the company profile, certificate scope, registered facility address, product catalog, industries served, quality documentation, and evidence of the required manufacturing process.'],
  ['What makes an industry supplier different from a general distributor?', 'An industry supplier is qualified around a specific end market and its technical or regulatory requirements. A general distributor primarily provides product availability across broader categories.'],
  ['Should you choose local or international suppliers?', 'Choose locally when shorter transit, easier audits, responsive engineering, or lower disruption risk matters. International sourcing can fit standardized, higher-volume requirements when longer logistics and compliance checks are acceptable.'],
  ['What questions should you ask a new supplier?', 'Ask who performs each process, what capacity is available, which certificates cover the facility, how changes are controlled, what inspection records are supplied, and how delivery problems are communicated.'],
];

document.querySelector('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Thomas Supply Search home">
      <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>THOMAS <small>Supply Search</small></span>
    </a>
    <nav aria-label="Primary navigation">
      <a href="#search">Find suppliers</a>
      <a href="#browse">Browse supplier matrix</a>
      <a href="#how-it-works">How sourcing works</a>
    </nav>
    <div class="header-actions">
      <a href="#claim">For suppliers</a>
      <button class="button button-small">Start a shortlist</button>
    </div>
    <button class="menu-button" aria-label="Open navigation" aria-expanded="false">Menu</button>
  </header>

  <main>
    <section class="hero" id="search" aria-labelledby="hero-title">
      <div class="blueprint" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="eyebrow">North American supplier discovery</p>
        <h1 id="hero-title">Supplier search.<br><em>Find a supplier for every industry.</em></h1>
        <p class="lede"><strong>Supplier directory:</strong> a searchable index of manufacturers, distributors, and service companies organized by products, processes, certifications, materials, locations, and industries. Use the directory to turn a technical requirement into a qualified supplier shortlist.</p>
      </div>

      <div class="search-tabs" role="tablist" aria-label="Choose how to search suppliers">
        ${Object.entries(searchModes).map(([id, mode], index) => `
          <button type="button" role="tab" id="tab-${id}" aria-controls="supplier-search" aria-selected="${index === 0}" tabindex="${index === 0 ? '0' : '-1'}" data-mode="${id}">
            <span aria-hidden="true">0${index + 1}</span>${mode.tab}
          </button>`).join('')}
      </div>

      <form class="search-workbench" id="supplier-search" role="tabpanel" aria-labelledby="tab-requirements">
        <div class="workbench-heading">
          <div>
            <span class="status-dot" aria-hidden="true"></span>
            <span id="mode-kicker">${searchModes.requirements.kicker}</span>
          </div>
          <span class="hint">Plain language works best</span>
        </div>
        <label for="query" id="query-label">${searchModes.requirements.label}</label>
        <div class="search-row">
          <span class="prompt-prefix" id="prompt-prefix" aria-hidden="true">${searchModes.requirements.prefix}</span>
          <textarea id="query" rows="2" placeholder="${searchModes.requirements.placeholder}" required></textarea>
          <button class="button search-button" type="submit">
            <span id="search-action">${searchModes.requirements.action}</span><span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="query-guidance" aria-label="Helpful details to include">
          <span>Helpful details:</span>
          <span id="guidance-buttons"></span>
        </div>
        <p class="form-message" role="status" aria-live="polite"></p>
      </form>

      <div class="popular" aria-labelledby="popular-title">
        <p id="popular-title">${searchModes.requirements.intro}</p>
        <div class="chips" id="search-examples"></div>
      </div>
    </section>

    <section class="proof" aria-label="Supplier network overview">
      ${networkStats.map(([value, label, explanation, scale]) => `
        <article class="proof-stat" tabindex="0" style="--scale:${scale}%">
          <span class="proof-number">${value}</span>
          <strong>${label}</strong>
          <p>${explanation}</p>
          <span class="proof-meter" aria-hidden="true"><i></i></span>
          <span class="stat-hint" aria-hidden="true">Hover to interpret</span>
        </article>`).join('')}
    </section>

    <section class="dimension-section" id="browse" aria-labelledby="dimension-title">
      <div class="dimension-heading">
        <p class="eyebrow dark">Supplier discovery matrix</p>
        <h2 id="dimension-title">Find suppliers by what qualifies them.</h2>
        <p>A category name identifies what a company sells. A sourcing dimension explains whether the company can satisfy the process, compliance, material, and industry conditions behind the purchase.</p>
      </div>
      <div class="dimension-tabs" role="tablist" aria-label="Browse supplier search dimensions">
        ${Object.entries(browseDimensions).map(([id, item], index) => `<button type="button" role="tab" id="dimension-tab-${id}" aria-selected="${index === 0}" aria-controls="dimension-panel" data-dimension="${id}">${item.label}</button>`).join('')}
      </div>
      <div class="dimension-panel" id="dimension-panel" role="tabpanel" aria-labelledby="dimension-tab-process">
        <aside>
          <p class="panel-label">Definition</p>
          <p id="dimension-definition"></p>
          <p class="panel-label">Qualification criteria</p>
          <ul id="dimension-criteria"></ul>
        </aside>
        <div class="dimension-topics" id="dimension-topics"></div>
      </div>
    </section>

    <section class="category-section" id="categories" aria-labelledby="category-title">
      <div class="section-intro">
        <p class="eyebrow dark">Choose the relationship you need</p>
        <h2 id="category-title">Source by supplier role, not guesswork.</h2>
        <p>Start with the kind of relationship your requirement calls for. Hover over each network count to see what that supplier pool means in practice.</p>
      </div>
      <div class="supplier-grid">
        ${supplierTypes.map((supplier, index) => `
          <a href="#search" class="supplier-card">
            <span class="card-index">${supplier.cue}</span>
            <span class="role-symbol" aria-hidden="true">0${index + 1}</span>
            <h3>${supplier.name}</h3>
            <p>${supplier.description}</p>
            <span class="profile-stat">
              <span class="profile-count">${supplier.count}</span>
              <span class="profile-label">supplier profiles</span>
            </span>
            <span class="profile-meter" aria-hidden="true"><i style="--share:${supplier.share}%"></i></span>
            <span class="stat-verbalization">${supplier.explanation}</span>
            <span class="card-action">Explore this supplier type <b aria-hidden="true">↗</b></span>
          </a>`).join('')}
      </div>
    </section>

    <section class="industry-section" id="industries" aria-labelledby="industry-title">
      <div class="industry-intro">
        <p class="eyebrow">Industry-specific suppliers</p>
        <h2 id="industry-title">Search with the end market in view.</h2>
        <p>Industry requirements change the acceptable material grades, documentation, quality systems, production controls, and supplier locations. These starting points combine those related attributes.</p>
      </div>
      <div class="industry-grid">
        ${industries.map(([name, capabilities, credentials, regions]) => `
          <article class="industry-card">
            <h3>${name}</h3>
            <p>${capabilities}</p>
            <dl><div><dt>Common credentials</dt><dd>${credentials}</dd></div><div><dt>Leading regions</dt><dd>${regions}</dd></div></dl>
            <button type="button" class="industry-search" data-industry-query="${name} suppliers">Search ${name} suppliers <span aria-hidden="true">→</span></button>
          </article>`).join('')}
      </div>
    </section>

    <section class="process" id="how-it-works" aria-labelledby="process-title">
      <div>
        <p class="eyebrow">How to find a supplier</p>
        <h2 id="process-title">Ten checks from requirement to selection.</h2>
        <p class="process-summary">A supplier search is complete when technical fit, quality evidence, commercial terms, delivery capability, and communication risk have all been evaluated.</p>
      </div>
      <ol class="sourcing-steps">
        ${sourcingSteps.map(([title, text]) => `<li><button type="button" aria-expanded="false"><strong>${title}</strong><span>${text}</span></button></li>`).join('')}
      </ol>
    </section>

    <section class="claim-banner" aria-labelledby="claim-title">
      <div><p class="eyebrow">For industrial companies</p><h2 id="claim-title">Claim your business profile.</h2></div>
      <p>Review company details, describe manufacturing capabilities, add certifications, and make the profile easier for procurement teams to evaluate.</p>
      <a class="button" href="#claim">Start the claim process →</a>
    </section>

    <section class="faq-section" aria-labelledby="faq-title">
      <div class="faq-intro"><p class="eyebrow dark">Supplier search questions</p><h2 id="faq-title">Procurement answers, stated directly.</h2></div>
      <div class="faq-list">
        ${faqs.map(([question, answer], index) => `<details ${index === 0 ? 'open' : ''}><summary>${question}<span aria-hidden="true">+</span></summary><p>${answer}</p></details>`).join('')}
      </div>
    </section>
  </main>

  <footer id="claim">
    <p><strong>Are you an industrial supplier?</strong> Make your capabilities easier for buyers to find.</p>
    <a href="#">Claim your company profile →</a>
  </footer>
`;

const form = document.querySelector('#supplier-search');
const query = document.querySelector('#query');
const message = document.querySelector('.form-message');
const modeKicker = document.querySelector('#mode-kicker');
const queryLabel = document.querySelector('#query-label');
const promptPrefix = document.querySelector('#prompt-prefix');
const searchAction = document.querySelector('#search-action');
const guidanceButtons = document.querySelector('#guidance-buttons');
const popularTitle = document.querySelector('#popular-title');
const searchExamples = document.querySelector('#search-examples');
let activeMode = 'requirements';

function renderMode(modeId, moveFocus = false) {
  const mode = searchModes[modeId];
  activeMode = modeId;
  modeKicker.textContent = mode.kicker;
  queryLabel.textContent = mode.label;
  promptPrefix.textContent = mode.prefix;
  query.placeholder = mode.placeholder;
  query.value = '';
  searchAction.textContent = mode.action;
  popularTitle.textContent = mode.intro;
  message.textContent = '';
  guidanceButtons.innerHTML = mode.guidance.map((item) => `<button type="button" data-insert=" ${item}">${item}</button>`).join('');
  searchExamples.innerHTML = mode.examples.map(([label, example]) => `<button type="button" data-query="${example}"><span>${label}</span><small>${example}</small></button>`).join('');

  document.querySelectorAll('.search-tabs [role="tab"]').forEach((tab) => {
    const selected = tab.dataset.mode === modeId;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) tab.focus();
  });
  form.setAttribute('aria-labelledby', `tab-${modeId}`);
}

document.querySelector('.search-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) renderMode(tab.dataset.mode);
});

document.querySelector('.search-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll('.search-tabs [role="tab"]')];
  const current = tabs.findIndex((tab) => tab.dataset.mode === activeMode);
  let next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1);
  if (next < 0) next = tabs.length - 1;
  if (next >= tabs.length) next = 0;
  event.preventDefault();
  renderMode(tabs[next].dataset.mode, true);
});

searchExamples.addEventListener('click', (event) => {
  const button = event.target.closest('[data-query]');
  if (!button) return;
  query.value = button.dataset.query;
  query.focus();
});

guidanceButtons.addEventListener('click', (event) => {
  const button = event.target.closest('[data-insert]');
  if (!button) return;
  const addition = button.dataset.insert;
  query.value = `${query.value.trim()}${query.value.trim() ? ',' : ''}${addition}`;
  query.focus();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = query.value.trim();
  if (!value) return;
  message.textContent = `${searchModes[activeMode].action} for “${value}”…`;
});

renderMode(activeMode);

const dimensionDefinition = document.querySelector('#dimension-definition');
const dimensionCriteria = document.querySelector('#dimension-criteria');
const dimensionTopics = document.querySelector('#dimension-topics');
const dimensionPanel = document.querySelector('#dimension-panel');

function renderDimension(dimensionId) {
  const dimension = browseDimensions[dimensionId];
  dimensionDefinition.textContent = dimension.definition;
  dimensionCriteria.innerHTML = dimension.criteria.map((criterion) => `<li>${criterion}</li>`).join('');
  dimensionTopics.innerHTML = dimension.topics.map(([title, note, queryText], index) => `
    <button type="button" class="dimension-topic" data-topic-query="${queryText}">
      <span>0${index + 1}</span><strong>${title}</strong><small>${note}</small><b aria-hidden="true">↗</b>
    </button>`).join('');
  document.querySelectorAll('[data-dimension]').forEach((tab) => {
    const selected = tab.dataset.dimension === dimensionId;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  dimensionPanel.setAttribute('aria-labelledby', `dimension-tab-${dimensionId}`);
}

document.querySelector('.dimension-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-dimension]');
  if (tab) renderDimension(tab.dataset.dimension);
});

dimensionTopics.addEventListener('click', (event) => {
  const topic = event.target.closest('[data-topic-query]');
  if (!topic) return;
  renderMode('requirements');
  query.value = topic.dataset.topicQuery;
  document.querySelector('#search').scrollIntoView({ behavior: 'smooth' });
  query.focus({ preventScroll: true });
});

document.querySelectorAll('[data-industry-query]').forEach((button) => {
  button.addEventListener('click', () => {
    renderMode('requirements');
    query.value = button.dataset.industryQuery;
    document.querySelector('#search').scrollIntoView({ behavior: 'smooth' });
  });
});

document.querySelectorAll('.sourcing-steps button').forEach((button) => {
  button.addEventListener('click', () => {
    button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded') !== 'true'));
  });
});

document.querySelectorAll('.faq-list details').forEach((details) => {
  details.addEventListener('toggle', () => {
    details.querySelector('summary span').textContent = details.open ? '−' : '+';
  });
});

renderDimension('process');

const menuButton = document.querySelector('.menu-button');
menuButton.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.textContent = open ? 'Close' : 'Menu';
});
