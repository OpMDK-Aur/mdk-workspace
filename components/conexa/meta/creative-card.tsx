import type { MetaCreative } from '@/lib/mock/meta-creatives'

const thumbnailBackground = 'repeating-linear-gradient(45deg,#F0F0F0,#F0F0F0 8px,#E6E6E3 8px,#E6E6E3 16px)'

export function CreativeCard({ creative }: { creative: MetaCreative }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#E6E6E3] bg-white">
      <div className="flex h-[120px] items-center justify-center" style={{ background: thumbnailBackground }}>
        <span className="rounded-[5px] bg-white px-2 py-[3px] font-mono text-[11px] text-[#9A9A9A]">{creative.format}</span>
      </div>
      <div className="p-[14px]">
        <p className="mb-0.5 text-[13.5px] font-bold text-[#141414]">{creative.name}</p>
        <p className="mb-2.5 text-[11.5px] text-[#9A9A9A]">{creative.campaign}</p>
        <div className="flex justify-between border-t border-[#F5F5F3] pt-2 text-[11.5px] text-[#5C5C5C]">
          <span>{creative.impressions} impr.</span>
          <span>CTR {creative.ctr}</span>
          <span>{creative.spend}</span>
        </div>
      </div>
    </div>
  )
}

export function CreativeGrid({ creatives }: { creatives: MetaCreative[] }) {
  return (
    <div className="mb-6 grid grid-cols-3 gap-[14px]">
      {creatives.map((creative) => <CreativeCard key={creative.name} creative={creative} />)}
    </div>
  )
}
