import { apiFetch } from '@/lib/apiFetch'
export default function NodeNetworkBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0 }}>
      {/* dark gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, #060d1a 0%, #0d1f3c 40%, #0a1628 70%, #110a02 100%)',
      }} />

      {/* ambient glow orbs */}
      <div style={{ position: 'absolute', top: -100, left: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,100,30,0.07)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(45,90,158,0.09)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '35%', left: '25%', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,144,80,0.05)', filter: 'blur(60px)', pointerEvents: 'none' }} />

      {/* node network */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox="0 0 960 540"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="ng1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF9050" stopOpacity="1" />
            <stop offset="100%" stopColor="#FF9050" stopOpacity="0.2" />
          </radialGradient>
          <radialGradient id="ng2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        {/* DQ / Governance edges — orange */}
        <line x1="55"  y1="55"  x2="180" y2="35"  stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="180" y1="35"  x2="330" y2="75"  stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="55"  y1="55"  x2="75"  y2="200" stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="75"  y1="200" x2="210" y2="245" stroke="#FF9050" strokeWidth="0.7" opacity="0.22" />
        <line x1="75"  y1="200" x2="45"  y2="370" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="45"  y1="370" x2="155" y2="435" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="155" y1="435" x2="285" y2="470" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="285" y1="470" x2="420" y2="490" stroke="#FF9050" strokeWidth="0.7" opacity="0.18" />
        <line x1="330" y1="75"  x2="210" y2="245" stroke="#FF9050" strokeWidth="0.5" opacity="0.14" />

        {/* AI edges — blue */}
        <line x1="590" y1="45"  x2="760" y2="28"  stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="760" y1="28"  x2="920" y2="65"  stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="920" y1="65"  x2="900" y2="210" stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="900" y1="210" x2="820" y2="330" stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="820" y1="330" x2="890" y2="440" stroke="#60a5fa" strokeWidth="0.7" opacity="0.18" />
        <line x1="890" y1="440" x2="750" y2="485" stroke="#60a5fa" strokeWidth="0.7" opacity="0.18" />
        <line x1="590" y1="45"  x2="670" y2="195" stroke="#60a5fa" strokeWidth="0.7" opacity="0.22" />
        <line x1="670" y1="195" x2="820" y2="330" stroke="#60a5fa" strokeWidth="0.7" opacity="0.18" />
        <line x1="670" y1="195" x2="750" y2="485" stroke="#60a5fa" strokeWidth="0.5" opacity="0.14" />

        {/* Bridge edges — purple */}
        <line x1="330" y1="75"  x2="590" y2="45"  stroke="#a78bfa" strokeWidth="0.8" opacity="0.18" />
        <line x1="210" y1="245" x2="670" y2="195" stroke="#a78bfa" strokeWidth="0.8" opacity="0.15" />
        <line x1="420" y1="490" x2="750" y2="485" stroke="#a78bfa" strokeWidth="0.8" opacity="0.15" />

        {/* DQ / Governance nodes */}
        <circle cx="55"  cy="55"  r="4"   fill="url(#ng1)" opacity="0.65" />
        <circle cx="180" cy="35"  r="3.5" fill="url(#ng1)" opacity="0.6" />
        <circle cx="330" cy="75"  r="4"   fill="url(#ng1)" opacity="0.65" />
        <circle cx="75"  cy="200" r="5"   fill="url(#ng1)" opacity="0.75" />
        <circle cx="210" cy="245" r="3.5" fill="url(#ng1)" opacity="0.6" />
        <circle cx="45"  cy="370" r="4"   fill="url(#ng1)" opacity="0.6" />
        <circle cx="155" cy="435" r="3.5" fill="url(#ng1)" opacity="0.55" />
        <circle cx="285" cy="470" r="4"   fill="url(#ng1)" opacity="0.6" />
        <circle cx="420" cy="490" r="3.5" fill="url(#ng1)" opacity="0.55" />

        {/* AI nodes */}
        <circle cx="590" cy="45"  r="4.5" fill="url(#ng2)" opacity="0.75" />
        <circle cx="760" cy="28"  r="4"   fill="url(#ng2)" opacity="0.65" />
        <circle cx="920" cy="65"  r="4"   fill="url(#ng2)" opacity="0.65" />
        <circle cx="900" cy="210" r="3.5" fill="url(#ng2)" opacity="0.6" />
        <circle cx="670" cy="195" r="5"   fill="url(#ng2)" opacity="0.75" />
        <circle cx="820" cy="330" r="4"   fill="url(#ng2)" opacity="0.65" />
        <circle cx="890" cy="440" r="3.5" fill="url(#ng2)" opacity="0.6" />
        <circle cx="750" cy="485" r="4"   fill="url(#ng2)" opacity="0.65" />

        {/* DQ labels */}
        <text x="63"  y="52"  fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Completeness</text>
        <text x="188" y="32"  fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Accuracy</text>
        <text x="338" y="72"  fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Timeliness</text>
        <text x="83"  y="197" fill="#FF9050" fontSize="10" fontFamily="monospace" fontWeight="600" opacity="0.55">Governance</text>
        <text x="218" y="242" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.5">Stewardship</text>
        <text x="53"  y="367" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Compliance</text>
        <text x="163" y="432" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Data Lineage</text>
        <text x="293" y="467" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Data Catalog</text>
        <text x="428" y="487" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.45">Policies</text>

        {/* AI labels */}
        <text x="598" y="42"  fill="#93c5fd" fontSize="10" fontFamily="monospace" fontWeight="700" opacity="0.6">AI Engine</text>
        <text x="768" y="25"  fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.55">Neural Network</text>
        <text x="928" y="62"  fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.55">Deep Learning</text>
        <text x="908" y="207" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.5">Predictive Analytics</text>
        <text x="678" y="192" fill="#93c5fd" fontSize="10" fontFamily="monospace" fontWeight="700" opacity="0.6">Anomaly Detection</text>
        <text x="828" y="327" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.5">NLP Processing</text>
        <text x="898" y="437" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.45">Smart Alerts</text>
        <text x="758" y="482" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.45">ML Profiling</text>

        {/* Bridge label */}
        <text x="460" y="140" fill="#c4b5fd" fontSize="9" fontFamily="monospace" opacity="0.35">AI-Powered Governance</text>
      </svg>
    </div>
  )
}
