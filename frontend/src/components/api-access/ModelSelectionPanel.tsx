import { useId, useMemo, useRef, useState } from "react"
import { ArrowRight, Search, X } from "lucide-react"
import { modelSearchText, type ModelOption } from "../../services/modelService"
import { Input } from "../ui/input"
import { Button } from "../ui/button"

interface ModelSelectionPanelProps {
  models: ModelOption[]
  selected: boolean
  loading: boolean
  onMove: (models: ModelOption[], selected: boolean) => void
}

export function ModelSelectionPanel({
  models,
  selected,
  loading,
  onMove,
}: ModelSelectionPanelProps) {
  const titleId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState("")
  const query = search.trim().toLowerCase()
  const visibleModels = useMemo(
    () => models.filter((model) => modelSearchText(model).includes(query)),
    [models, query],
  )

  return (
    <section
      className="flex-1 flex flex-col min-w-0 border border-border/50 rounded-lg bg-card overflow-hidden"
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between p-2.5 border-b border-border/40 bg-muted/30">
        <div className="flex items-center gap-2">
          <h3 id={titleId} className="text-xs font-semibold text-foreground">
            {selected ? "已选模型" : "可选模型"}
          </h3>
          <span className="text-[11px] font-mono text-muted-foreground">
            {query ? `${visibleModels.length} / ${models.length}` : models.length}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onMove(visibleModels, !selected)}
          disabled={loading || visibleModels.length === 0}
          className="h-6 text-[11px] px-2"
        >
          {selected
            ? query
              ? "移除筛选结果"
              : "移除全部"
            : query
              ? "添加筛选结果"
              : "添加全部"}
        </Button>
      </div>

      <div className="p-2 border-b border-border/40 relative">
        <Search className="size-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={selected ? "搜索已选模型..." : "搜索可选模型..."}
          className="h-7 text-xs pl-7 pr-7 font-mono"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("")
              searchRef.current?.focus()
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto max-h-72 p-1 space-y-1">
        {visibleModels.length ? (
          visibleModels.map((model) => (
            <button
              key={model.name}
              type="button"
              disabled={loading}
              onClick={() => onMove([model], !selected)}
              className="w-full flex items-center justify-between p-1.5 px-2 rounded-md hover:bg-muted/50 text-left transition-colors group"
            >
              <div className="min-w-0 pr-2">
                <div
                  className="font-mono text-xs font-medium truncate text-foreground"
                  title={model.name}
                >
                  {model.name}
                </div>
                {(model.alias || model.displayName) && (
                  <div
                    className="text-[10px] text-muted-foreground truncate"
                    title={model.alias || model.displayName}
                  >
                    {model.alias || model.displayName}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-muted-foreground group-hover:text-foreground">
                {selected ? <X className="size-3.5" /> : <ArrowRight className="size-3.5" />}
              </span>
            </button>
          ))
        ) : (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {query
              ? "未找到匹配模型"
              : loading
                ? "正在探测拉取..."
                : selected
                  ? "暂未选择任何模型"
                  : "暂无可添加模型"}
          </div>
        )}
      </div>
    </section>
  )
}
