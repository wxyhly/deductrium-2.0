export {tileVertices, halfPlaneContains, canonicalPath, transport, relativePath, regionContains} from '../../js/hy/half-plane.js';
import {canonicalPath, transport, relativePath} from '../../js/hy/half-plane.js';

/** Root frame of the orientation-preserving isometry sending source to target.
 * rotation is the image of source's canonical edge 0 in target's frame.
 * result.transform(path, direction=0) maps an old tile frame, including when
 * the intermediate image of the root exceeds the public 512-step input limit.
 */
export function relocationFrame(source, target, rotation, polygon) {
    if (!Number.isInteger(rotation) || rotation < 0 || rotation > 5) throw Error('旋转方向须为 0～5');
    const origin = canonicalPath(source, polygon), destination = canonicalPath(target, polygon);
    const inverse = relativePath('', origin, polygon);
    const oldRoot = transport(inverse, origin, 0, polygon);
    const newRoot = transport(inverse, destination, rotation, polygon);
    const mod = n=>(n%6+6)%6, offset = mod(newRoot.rotation-oldRoot.rotation);
    const transform = (path, direction=0) => {
        if (!Number.isInteger(direction) || direction < 0 || direction > 5) throw Error('旋转方向须为 0～5');
        if (newRoot.at.length <= 512) {
            const frame = transport(path,newRoot.at,offset,polygon);
            return {at:frame.at,rotation:mod(frame.rotation+direction)};
        }
        // Only generated intermediate frames bypass the address limit. The old
        // input and the eventual project coordinates still use canonicalPath.
        let local=[],at=[...newRoot.at],turn=offset;
        for (const edge of canonicalPath(path,polygon)) {
            const [nextLocal,backLocal]=polygon.getNeighborAndDir(local,edge,true);
            const [nextGlobal,backGlobal]=polygon.getNeighborAndDir(at,mod(edge+turn),true);
            local=nextLocal;at=nextGlobal;turn=mod(backGlobal-backLocal);
        }
        return {at,rotation:mod(turn+direction)};
    };
    return {at:[...newRoot.at],rotation:offset,transform};
}
