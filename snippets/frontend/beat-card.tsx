import { useState } from "react";
import type { BeatWithProducer } from "../shared/schema";

type LicenseType = "standard" | "premium" | "exclusive";

interface BeatCardProps {
  beat: BeatWithProducer;
  viewMode: "grid" | "list";
}

export default function BeatCard({ beat, viewMode }: BeatCardProps) {
  const [shouldAutoplay, setShouldAutoplay] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<LicenseType>("standard");
  const wavUnavailable = !beat.hasWav;

  const getPrice = () => {
    switch (selectedLicense) {
      case "standard":
        return beat.standardPrice;
      case "premium":
        return beat.premiumPrice;
      case "exclusive":
        return beat.exclusivePrice;
      default:
        return beat.standardPrice;
    }
  };

  const currentPrice = getPrice();

  const getBackgroundStyle = () => {
    if (beat.artworkUrl) {
      return {
        backgroundImage: `url(/api/beats/${beat.id}/artwork)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }

    return {
      background: "linear-gradient(135deg, hsl(0, 0%, 15%), hsl(0, 0%, 25%))",
    };
  };

  const handleLicenseChange = (value: LicenseType) => {
    if (wavUnavailable && (value === "premium" || value === "exclusive")) {
      return;
    }

    setSelectedLicense(value);
  };

  const handleBeatCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button:not([data-audio-control])")) {
      return;
    }

    setShouldAutoplay(true);
    setTimeout(() => setShouldAutoplay(false), 100);
  };

  return (
    <article onClick={handleBeatCardClick} data-view-mode={viewMode}>
      <div style={getBackgroundStyle()}>
        <audio data-audio-control src={beat.audioFileUrl} autoPlay={shouldAutoplay} />
      </div>

      <h3>{beat.title}</h3>
      <p>by {beat.producer.name}</p>
      <p>{beat.genre} • {beat.bpm} BPM • {beat.key}</p>

      <select value={selectedLicense} onChange={(event) => handleLicenseChange(event.target.value as LicenseType)}>
        <option value="standard">Standard (MP3)</option>
        <option value="premium" disabled={wavUnavailable}>Premium (WAV)</option>
        <option value="exclusive" disabled={wavUnavailable}>Exclusive (WAV)</option>
      </select>

      <div>${currentPrice}</div>
      {wavUnavailable ? <small>WAV not available for this track</small> : null}
    </article>
  );
}
