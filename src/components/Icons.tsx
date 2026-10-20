import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
})

export const Search = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
export const Plus = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>
export const Close = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
export const ChevronLeft = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m15 5-7 7 7 7" /></svg>
export const ChevronRight = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m9 5 7 7-7 7" /></svg>
export const Heart = ({ size, filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(size)} {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
)
export const List = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>
export const Moon = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>
export const Sun = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
export const Expand = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
export const Shrink = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
export const Edit = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>
export const Trash = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
export const Clock = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
export const Books = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 4h4v16H4zM9.5 4h4v16h-4zM15 5.2l3.8-1 4 15.5-3.8 1z" /></svg>
export const Upload = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4.5h14V15" /></svg>
export const Check = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
export const Settings = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
export const BookOpen = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 6.5C10 5 7 4.5 3.5 5v13.5C7 18 10 18.5 12 20c2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" /><path d="M12 6.5V20" /></svg>
export const StickyNote = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 4h14v10l-5 6H5z" /><path d="M14 20v-6h5" /><path d="M8.5 9h7M8.5 12h4" /></svg>
export const BarChart = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 20h16" /><path d="M6 16V11M10.5 16V6M15 16v-7M19.5 16V4" /></svg>
export const Highlighter = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="m9 15 6.5-6.5a2.1 2.1 0 0 0-3-3L6 12l-1.5 4.5L9 15Z" /><path d="m4.5 16.5-1.5 3h4.5l1-2" /><path d="M13 20h8" /></svg>
export const OnePage = ({ size, ...p }: P) => <svg {...base(size)} {...p}><rect x="6.5" y="3.5" width="11" height="17" rx="1.5" /><path d="M9.5 8h5M9.5 11h5M9.5 14h3" /></svg>
export const TwoPages = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 5.5C10 4.5 6.5 4 3 4.5v14c3.5-.5 7 0 9 1 2-1 5.5-1.5 9-1v-14c-3.5-.5-7 0-9 1Z" /><path d="M12 5.5v14" /></svg>
export const Play = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" /></svg>
export const Pause = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth="2.6" /></svg>
export const Timer = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M10 3h4M18.5 6.5 20 5" /></svg>
export const Camera = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
export const Rotate = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" /></svg>
export const Queue = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 6h11M4 12h11M4 18h7" /><path d="m16 15 3 3-3 3" /><path d="M19 18h-5" /></svg>
export const Bag = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></svg>
export const More = ({ size, ...p }: P) => <svg {...base(size)} {...p}><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></svg>
export const Shelf = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M3 20h18M5 20V6h3v14M9.5 20V4h3v16M14 20l1.5-14 3 .3L17 20" /></svg>
export const Sparkle = ({ size, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" /><path d="M18.5 15.5c.25 1.6 1 2.35 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.15 2.25-.9 2.5-2.5Z" /></svg>
