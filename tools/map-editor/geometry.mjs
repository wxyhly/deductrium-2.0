// Exact homogeneous Lorentz coordinates for the game's {6,4} tiling:
// (z,x,y) = (sqrt(3)*Z, X/sqrt(2), sqrt(3/2)*Y).
// The metric is 6*Z*Z' - X*X' - 3*Y*Y'. Positive projective
// rescaling preserves side tests, so every operation below uses BigInt.
const identity=[1n,0n,0n, 0n,1n,0n, 0n,0n,1n];
const turn=[2n,0n,0n, 0n,1n,3n, 0n,-1n,1n];
// polygon.neighborMatrix[0]: boost through edge 0 followed by a half turn.
const neighbor=[3n,0n,-2n, 0n,-1n,0n, 4n,0n,-3n];
const vertices=[[1n,-1n,1n],[1n,1n,1n],[1n,2n,0n],
    [1n,1n,-1n],[1n,-1n,-1n],[1n,-2n,0n]];
const mod=n=>(n%6+6)%6;
function gcd(a,b) {a=a<0n?-a:a;b=b<0n?-b:b;while(b) [a,b]=[b,a%b];return a;}
function reduce(values) {
    let divisor=0n;for(const value of values) divisor=gcd(divisor,value);
    return divisor>1n?values.map(value=>value/divisor):values;
}
function multiply(a,b) {
    return reduce(Array.from({length:9},(_,i)=>{
        const row=Math.floor(i/3)*3,col=i%3;
        return a[row]*b[col]+a[row+1]*b[col+3]+a[row+2]*b[col+6];
    }));
}
function apply(matrix,point) {
    return reduce([0,3,6].map(row=>matrix[row]*point[0]+matrix[row+1]*point[1]+matrix[row+2]*point[2]));
}
const rotations=[identity];
for(let i=1;i<6;i++) rotations.push(multiply(rotations[i-1],turn));
const steps=rotations.map(rotation=>rotations.map(back=>multiply(multiply(rotation,neighbor),back)));
const caches=new WeakMap();
function frame(path,polygon) {
    if(polygon.p!==6||polygon.q!==4) throw Error('半平面几何要求 (6,4) 铺砌');
    let cache=caches.get(polygon);if(!cache) {cache=new Map([['',identity]]);caches.set(polygon,cache);}
    let matrix=identity,current=[];
    for(const direction of path) {
        const [next,back]=polygon.getNeighborAndDir(current,direction,true),hash=next.join(',');
        matrix=cache.get(hash)??multiply(matrix,steps[direction][mod(-back)]);
        if(cache.size>=4096) cache.clear();cache.set(hash,matrix);current=next;
    }
    return matrix;
}
// path is a canonical tile address in the boundary tile's frame.
export function tileVertices(path,polygon) {
    const matrix=frame(path,polygon);return vertices.map(point=>apply(matrix,point));
}
export function halfPlaneContains(path,edge,side,polygon) {
    const matrix=multiply(rotations[mod(-edge)],frame(path,polygon));
    // The inward edge-0 normal is n3=(1,0,sqrt(2)); <v,n3> has
    // precisely the sign of Z-Y. Check all six vertices, including equality.
    return vertices.every(point=>{const [z,,y]=apply(matrix,point);return side===1?z>=y:z<=y;});
}
