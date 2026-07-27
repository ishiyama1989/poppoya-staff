// 場所（住所・スポット名）から地図アプリで開くURLを作る
// APIキー不要。Google マップ / Apple マップの両方に対応。

export function googleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
}

export function appleMapsUrl(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}
