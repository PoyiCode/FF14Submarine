// 第三欄：等價基礎素材進度面板
// 將庫存中的半成品換算為等價基礎素材，顯示整體進度（數量/目標/剩餘/百分比）
import { sortRaw } from '../data/calculations'

interface Props {
  hasTarget: boolean
  required: Record<string, number>
  equivalent: Record<string, number>
}

export default function ProgressPanel({ hasTarget, required, equivalent }: Props) {
  return (
    <section className="panel result-panel">
      <h2>等價基礎素材</h2>
      {hasTarget ? (
        <table className="progress-table">
          <thead>
            <tr>
              <th>基礎素材</th>
              <th>數量</th>
              <th>目標</th>
              <th>剩餘</th>
              <th>進度</th>
            </tr>
          </thead>
          <tbody>
            {sortRaw(Object.keys(required)).map((mat) => {
              const req = required[mat]
              const have = equivalent[mat] ?? 0
              const remaining = Math.max(0, req - have)
              const done = have >= req
              const pct = Math.min(100, Math.floor((have / req) * 100))
              return (
                <tr key={mat} className={done ? 'row-done' : ''}>
                  <td>{mat}</td>
                  <td className="num">{have > 99999 ? 99999 : have}</td>
                  <td className="num">{req > 99999 ? 99999 : req}</td>
                  <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                    {done ? '✓' : remaining > 99999 ? 99999 : remaining}
                  </td>
                  <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                    {pct}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="empty-hint">請先選擇成品</p>
      )}
    </section>
  )
}
