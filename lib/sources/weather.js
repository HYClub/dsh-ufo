/**
 * 当天天气：只有被问到某条具体记录时才查，用来支撑结尾那句「我记得那天……」。
 * 数据源 Open-Meteo（历史再分析 + 地名解析），不需要 key。
 * 拿不到就明说拿不到，绝不让模型自己编天气。
 * @module dsh-ufo/lib/sources/weather
 */
const UA = 'dsh-ufo/0.1 (historical weather)'

const WMO = [
  [0, '晴'],
  [1, '基本晴'],
  [2, '局部多云'],
  [3, '阴'],
  [45, '雾'],
  [48, '雾凇'],
  [51, '小毛毛雨'],
  [61, '小雨'],
  [63, '中雨'],
  [65, '大雨'],
  [71, '小雪'],
  [73, '中雪'],
  [75, '大雪'],
  [80, '阵雨'],
  [81, '强阵雨'],
  [82, '暴雨'],
  [95, '雷暴'],
  [96, '雷暴伴冰雹']
]

/**
 * @param {{ lat?: number|null, lon?: number|null, place?: string|null, date?: string|null }} input
 */
export async function weatherFor(input) {
  const date = String(input.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, note: '这条记录的日期不完整，取不到当天天气。' }
  }

  let lat = input.lat
  let lon = input.lon
  let resolvedPlace = input.place ?? null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const geo = await geocode(input.place)
    if (!geo) return { ok: false, note: `没有坐标，也定位不到「${input.place ?? '该地点'}」，取不到天气。` }
    lat = geo.lat
    lon = geo.lon
    resolvedPlace = geo.label
  }

  const url =
    'https://archive-api.open-meteo.com/v1/archive?latitude=' +
    lat +
    '&longitude=' +
    lon +
    '&start_date=' +
    date +
    '&end_date=' +
    date +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto'

  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`Open-Meteo 返回 ${res.status}`)
  const body = await res.json()
  const daily = body?.daily
  if (!daily?.time?.length) return { ok: false, note: '该日期没有可用的历史天气数据。' }

  const code = daily.weather_code?.[0]
  return {
    ok: true,
    date,
    place: resolvedPlace,
    lat,
    lon,
    tmax: daily.temperature_2m_max?.[0] ?? null,
    tmin: daily.temperature_2m_min?.[0] ?? null,
    precipitation: daily.precipitation_sum?.[0] ?? null,
    code,
    text: describe(code),
    note: '历史再分析数据，用于氛围参考，不是当日实况观测。'
  }
}

async function geocode(place) {
  const name = String(place ?? '').split(',')[0].trim()
  if (!name) return null
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh`
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) return null
  const body = await res.json()
  const hit = body?.results?.[0]
  if (!hit) return null
  return { lat: hit.latitude, lon: hit.longitude, label: hit.name ?? name }
}

function describe(code) {
  if (!Number.isFinite(code)) return '天气不明'
  const hit = WMO.find(([value]) => value === code)
  if (hit) return hit[1]
  if (code >= 51 && code <= 67) return '雨'
  if (code >= 71 && code <= 77) return '雪'
  if (code >= 80 && code <= 82) return '阵雨'
  return '天气不明'
}
