import { appleMapsUrl, googleMapsUrl } from "../lib/maps";

// 場所を地図アプリで開くリンク（Google / Apple）。入力が空なら何も出さない。
export default function MapLinks({ query }: { query: string }) {
  if (!query.trim()) return null;
  return (
    <span className="map-links">
      <a
        className="map-link"
        href={googleMapsUrl(query)}
        target="_blank"
        rel="noopener noreferrer"
      >
        🗺️ Googleマップ
      </a>
      <a
        className="map-link"
        href={appleMapsUrl(query)}
        target="_blank"
        rel="noopener noreferrer"
      >
         Appleマップ
      </a>
    </span>
  );
}
