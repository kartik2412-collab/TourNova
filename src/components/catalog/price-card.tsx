import { Card } from "@/components/ui/card";
import { freshnessBadge } from "@/lib/catalog/freshness-badge";
import { formatPrice, type PublicPrice } from "@/lib/catalog/fairprice";

/** One public (VERIFIED/LIVE) price record with its type + provenance labels. */
export function PriceCard({ price }: { price: PublicPrice }) {
  const display = formatPrice(price.amount, price.currency);
  const range = price.amountMax != null ? ` — ${formatPrice(price.amountMax, price.currency)}` : "";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{price.description ?? price.category}</p>
          <p className="mt-1 text-lg font-semibold">
            {display}
            {range}
          </p>
        </div>
        <span className={freshnessBadge(price.freshness)}>{price.freshness}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">{price.category}</span>
        <span className="rounded-full bg-muted px-2 py-0.5">{price.priceType}</span>
        <span>
          from <span className="font-medium text-foreground">{price.source.name}</span>
        </span>
        {price.verifiedAt ? (
          <span>(verified {price.verifiedAt.toISOString().slice(0, 10)})</span>
        ) : null}
      </div>
      {price.targetType === "attraction" ? (
        <a
          href={`/discover/${encodeURIComponent(price.targetId)}`}
          className="mt-2 inline-block text-xs text-accent underline"
        >
          View destination →
        </a>
      ) : null}
    </Card>
  );
}
