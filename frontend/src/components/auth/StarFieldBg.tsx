'use client'
import { apiFetch } from '@/lib/apiFetch'

/* Blinking star field — DQ keywords in orange, AI keywords in blue.
   Stars are SVG groups animated with CSS keyframes at staggered delays. */
export default function StarFieldBg() {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <style>{`
            @keyframes twinkleA { 0%,100%{opacity:0.85} 50%{opacity:0.08} }
            @keyframes twinkleB { 0%,100%{opacity:0.70} 45%{opacity:0.05} }
            @keyframes twinkleC { 0%,100%{opacity:0.90} 55%{opacity:0.12} }
            .tw1  { animation: twinkleA 2.4s ease-in-out infinite; }
            .tw2  { animation: twinkleB 3.1s 0.6s ease-in-out infinite; }
            .tw3  { animation: twinkleC 1.9s 1.2s ease-in-out infinite; }
            .tw4  { animation: twinkleA 2.8s 0.3s ease-in-out infinite; }
            .tw5  { animation: twinkleB 3.4s 1.7s ease-in-out infinite; }
            .tw6  { animation: twinkleC 2.2s 0.9s ease-in-out infinite; }
            .tw7  { animation: twinkleA 1.8s 2.1s ease-in-out infinite; }
            .tw8  { animation: twinkleB 2.6s 0.4s ease-in-out infinite; }
            .tw9  { animation: twinkleC 3.0s 1.5s ease-in-out infinite; }
            .tw10 { animation: twinkleA 2.3s 1.0s ease-in-out infinite; }
            .tw11 { animation: twinkleB 1.7s 2.4s ease-in-out infinite; }
            .tw12 { animation: twinkleC 2.9s 0.7s ease-in-out infinite; }
            .tw13 { animation: twinkleA 3.3s 1.3s ease-in-out infinite; }
            .tw14 { animation: twinkleB 2.1s 1.9s ease-in-out infinite; }
            .tw15 { animation: twinkleC 2.7s 0.2s ease-in-out infinite; }
            .tw16 { animation: twinkleA 1.6s 2.6s ease-in-out infinite; }
            .tw17 { animation: twinkleB 3.2s 0.8s ease-in-out infinite; }
            .tw18 { animation: twinkleC 2.0s 1.6s ease-in-out infinite; }
            .tw19 { animation: twinkleA 2.5s 2.0s ease-in-out infinite; }
            .tw20 { animation: twinkleB 3.6s 0.5s ease-in-out infinite; }
            .tw21 { animation: twinkleC 1.5s 2.8s ease-in-out infinite; }
            .tw22 { animation: twinkleA 2.2s 1.4s ease-in-out infinite; }
            .tw23 { animation: twinkleB 2.9s 0.1s ease-in-out infinite; }
            .tw24 { animation: twinkleC 3.5s 1.8s ease-in-out infinite; }
          `}</style>
          <filter id="glow-o" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-b" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Data Quality stars (orange) ─────────────────────────────── */}
        <g className="tw1">
          <circle cx="80"  cy="130" r="3"   fill="#FF9050" filter="url(#glow-o)"/>
          <text x="90" y="127" fill="#FF9050" fontSize="10" fontFamily="monospace" opacity="0.75">Completeness</text>
        </g>
        <g className="tw4">
          <circle cx="170" cy="290" r="2.5" fill="#FF9050" filter="url(#glow-o)"/>
          <text x="180" y="287" fill="#FF9050" fontSize="10" fontFamily="monospace" opacity="0.70">Accuracy</text>
        </g>
        <g className="tw7">
          <circle cx="55"  cy="460" r="3.5" fill="#FF9050" filter="url(#glow-o)"/>
          <text x="65" y="457" fill="#FF9050" fontSize="11" fontFamily="monospace" fontWeight="600" opacity="0.80">Governance</text>
        </g>
        <g className="tw10">
          <circle cx="220" cy="590" r="2.5" fill="#FF9050" filter="url(#glow-o)"/>
          <text x="230" y="587" fill="#FF9050" fontSize="10" fontFamily="monospace" opacity="0.70">Stewardship</text>
        </g>
        <g className="tw13">
          <circle cx="90"  cy="750" r="3"   fill="#FF9050" filter="url(#glow-o)"/>
          <text x="100" y="747" fill="#FF9050" fontSize="10" fontFamily="monospace" opacity="0.72">Compliance</text>
        </g>
        <g className="tw16">
          <circle cx="310" cy="820" r="2"   fill="#FF9050" filter="url(#glow-o)"/>
          <text x="320" y="817" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.60">Data Lineage</text>
        </g>
        <g className="tw19">
          <circle cx="400" cy="70"  r="2.5" fill="#FF9050" filter="url(#glow-o)"/>
          <text x="410" y="67" fill="#FF9050" fontSize="10" fontFamily="monospace" opacity="0.68">Freshness</text>
        </g>
        <g className="tw22">
          <circle cx="130" cy="200" r="2"   fill="#FF9050" filter="url(#glow-o)"/>
          <text x="140" y="197" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.62">Validity</text>
        </g>
        <g className="tw3">
          <circle cx="350" cy="720" r="2.5" fill="#FF9050" filter="url(#glow-o)"/>
          <text x="360" y="717" fill="#FF9050" fontSize="10" fontFamily="monospace" opacity="0.68">Uniqueness</text>
        </g>
        <g className="tw6">
          <circle cx="240" cy="390" r="2"   fill="#FF9050" filter="url(#glow-o)"/>
          <text x="250" y="387" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.60">Consistency</text>
        </g>
        <g className="tw9">
          <circle cx="460" cy="820" r="2"   fill="#FF9050" filter="url(#glow-o)"/>
          <text x="470" y="817" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.58">Data Catalog</text>
        </g>
        <g className="tw12">
          <circle cx="370" cy="160" r="2.5" fill="#FF9050" filter="url(#glow-o)"/>
          <text x="380" y="157" fill="#FF9050" fontSize="9"  fontFamily="monospace" opacity="0.64">Profiling</text>
        </g>

        {/* ── AI stars (blue) ────────────────────────────────────────── */}
        <g className="tw2">
          <circle cx="1100" cy="95"  r="3.5" fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1110" y="92" fill="#93c5fd" fontSize="11" fontFamily="monospace" fontWeight="700" opacity="0.80">AI Engine</text>
        </g>
        <g className="tw5">
          <circle cx="1300" cy="140" r="3"   fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1310" y="137" fill="#93c5fd" fontSize="10" fontFamily="monospace" opacity="0.72">Neural Network</text>
        </g>
        <g className="tw8">
          <circle cx="1220" cy="280" r="2.5" fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1232" y="277" fill="#93c5fd" fontSize="10" fontFamily="monospace" opacity="0.70">Machine Learning</text>
        </g>
        <g className="tw11">
          <circle cx="1050" cy="420" r="3.5" fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1062" y="417" fill="#93c5fd" fontSize="11" fontFamily="monospace" fontWeight="700" opacity="0.80">Anomaly Detection</text>
        </g>
        <g className="tw14">
          <circle cx="1320" cy="470" r="2.5" fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1332" y="467" fill="#93c5fd" fontSize="10" fontFamily="monospace" opacity="0.68">Deep Learning</text>
        </g>
        <g className="tw17">
          <circle cx="1150" cy="600" r="3"   fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1162" y="597" fill="#93c5fd" fontSize="10" fontFamily="monospace" opacity="0.72">NLP Processing</text>
        </g>
        <g className="tw20">
          <circle cx="1370" cy="700" r="2"   fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1382" y="697" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.60">Smart Alerts</text>
        </g>
        <g className="tw23">
          <circle cx="1060" cy="770" r="2.5" fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1072" y="767" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.62">ML Profiling</text>
        </g>
        <g className="tw15">
          <circle cx="990"  cy="160" r="2.5" fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1002" y="157" fill="#93c5fd" fontSize="10" fontFamily="monospace" opacity="0.68">Predictive Analytics</text>
        </g>
        <g className="tw18">
          <circle cx="1250" cy="820" r="2"   fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1262" y="817" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.58">Pattern Recognition</text>
        </g>
        <g className="tw21">
          <circle cx="1090" cy="320" r="2"   fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="1102" y="317" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.62">Auto Discovery</text>
        </g>
        <g className="tw24">
          <circle cx="970"  cy="820" r="2"   fill="#60a5fa" filter="url(#glow-b)"/>
          <text x="982" y="817" fill="#93c5fd" fontSize="9"  fontFamily="monospace" opacity="0.58">AI Insights</text>
        </g>

        {/* ── Plain background stars for depth ──────────────────────── */}
        {[
          [140,60],[260,140],[480,200],[520,860],[180,690],[430,500],
          [310,330],[70,320],[200,840],[440,430],[155,550],[490,680],
          [1200,60],[1400,200],[1420,350],[1380,550],[1180,740],[1020,700],
          [960,60],[1140,210],[1010,530],[1360,820],[1190,480],[1410,760],
          [700,40],[760,870],[580,820],[880,50],[640,860],
        ].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx} cy={cy}
            r={i % 3 === 0 ? 1.5 : i % 3 === 1 ? 1 : 1.2}
            fill={i % 2 === 0 ? '#FF9050' : '#60a5fa'}
            opacity="0.25"
            className={`tw${(i % 12) + 1}`}
          />
        ))}
      </svg>
    </div>
  )
}
