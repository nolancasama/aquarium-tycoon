import { useEffect, useMemo } from "react";
import { EXHIBITS } from "../../game/data/coast";
import { smoothMat } from "../materials";
import { lowerGalleryGeometry } from "./coastGallery";

/** Permanent connected architecture; selecting a view only moves the camera. */
export function CoastGallery() {
  const floor = useMemo(lowerGalleryGeometry, []);
  useEffect(() => () => { floor.dispose(); }, [floor]);
  const ex = EXHIBITS.penguins;
  return <group position={[ex.x, 0, ex.z]} name="coast-lower-gallery">
    <mesh name="coast-lower-gallery-floor" geometry={floor} material={smoothMat} raycast={() => undefined} />
  </group>;
}
