/* Adapted from the supplied perspective_recreation/renderer.js.
 * Canvas geometry only; reference credits are in THIRD_PARTY_NOTICES.md.
 * Reuse scene geometry/depth ordering instead of rebuilding it every frame.
 * No global window API, video, image, WebGL or third-party dependency.
 */
const W=1280,H=720,INK='#181c28';
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
const color=(a,b,t)=>{
  const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16);
  return `rgb(${[16,8,0].map(s=>Math.round(mix((x>>s)&255,(y>>s)&255,t))).join(',')})`;
};
const crossingKeys=[
  [0,0,640,610,0],[.22,0,640,610,0],[.62,1,640,610,0],[1.22,1,640,610,0],
  [1.6,1,640,-130,0],[2.15,1,640,-130,0],[2.56,0,640,610,0],[3.14,0,640,610,0],
  [3.499,.18,640,480,0],[3.5,1,620,-100,1],[4.22,1,620,-100,1],
  [4.64,1,405,-50,1],[5.16,1,405,-50,1],[5.58,1,685,445,1],
  [6.15,1,685,445,1],[6.8,0,640,610,0],[7,0,640,610,0],
];
const stationKeys=[
  [0,0,640,190,0],[.17,0,640,190,0],[.43,1,625,190,0],[.82,1,625,190,0],
  [1.13,0,640,190,0],[1.46,0,640,190,0],[1.78,1,625,190,0],[2.08,1,625,190,0],
  [2.3,1,1050,355,0],[2.76,1,1050,355,0],[3.05,1,1070,5,0],[3.45,1,1070,5,0],
  [3.79,1,145,170,0],[4.14,1,145,170,0],[4.49,0,640,190,0],[4.76,0,640,190,0],
  [5.05,1,625,190,0],[5.36,1,625,190,0],[5.69,0,640,190,0],[6.06,0,640,190,0],
  [6.35,1,625,190,0],[6.77,1,625,190,0],[7.04,1,1050,355,0],[7.5,1,1050,355,0],
  [7.79,1,1070,5,0],[8.09,1,1070,5,0],[8.43,1,145,170,0],[8.73,1,145,170,0],
  [9.08,0,640,190,0],[28/3,0,640,190,0],
];
function sample(keys,time){
  const duration=keys[keys.length-1][0];
  time=((time%duration)+duration)%duration;
  let i=0;while(i<keys.length-2&&time>keys[i+1][0])i++;
  const a=keys[i],b=keys[i+1],t=ease((time-a[0])/(b[0]-a[0]));
  return {depth:mix(a[1],b[1],t),vx:mix(a[2],b[2],t),hy:mix(a[3],b[3],t),
    layout:time<3.5&&keys===crossingKeys?0:(a[4]||0),time,
    blue:keys===stationKeys?ease((time-4.98)/.65)*(1-ease((time-9.09)/.24)):0};
}
export function perspectiveState(scene,time){
  return sample(scene==='station'?stationKeys:crossingKeys,time);
}
function projector(state,scale=72,floor=665){
  return p=>{
    const [x,y,z]=p,s=1/(1+Math.max(0,z)*.105*state.depth);
    return [mix(state.vx,640+x*scale,s),mix(state.hy,floor-y*scale,s)];
  };
}
function brush(ctx){
  function poly(pts,fill,stroke=INK,width=1.3){
    if(pts.length<2)return;
    ctx.beginPath();ctx.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)ctx.lineTo(...pts[i]);ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.stroke();}
  }
  function line(a,b,c=INK,width=1){
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=c;ctx.lineWidth=width;ctx.stroke();
  }
  function rect(x,y,w,h,fill,stroke=INK,lw=1.3){poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill,stroke,lw);}
  function ellipse(x,y,rx,ry,fill,stroke=INK,lw=1.3){
    ctx.beginPath();ctx.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,Math.PI*2);
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
  }
  return {poly,line,rect,ellipse};
}
// At most two cached scenes, including only the most recent station palette.
const geometryCache=new Map();
function sceneBuilder(project,scene,palette=0){
  const previous=geometryCache.get(scene),cached=previous?.palette===palette;
  const items=cached?previous.items:[];
  const add=(points,fill,stroke=INK,width=1.15,bias=0)=>{
    items.push({points,fill,stroke,width,z:points.reduce((s,p)=>s+p[2],0)/points.length+bias});
  };
  const line=(a,b,c=INK,w=1,bias=0)=>add([a,b],null,c,w,bias);
  function front(x0,x1,y0,y1,z,c,bias=0){add([[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]],c,INK,1.15,bias);}
  function side(x,z0,z1,y0,y1,c,bias=0){add([[x,y0,z0],[x,y0,z1],[x,y1,z1],[x,y1,z0]],c,INK,1.15,bias);}
  function floor(x0,x1,z0,z1,y,c,bias=0){add([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]],c,INK,.8,bias);}
  function box(x0,x1,y0,y1,z0,z1,c1,c2=c1,c3=c1){
    side(x0,z0,z1,y0,y1,c2);side(x1,z0,z1,y0,y1,c2);front(x0,x1,y0,y1,z0,c1);floor(x0,x1,z0,z1,y1,c3);
  }
  function paint(b){
    if(!cached){items.sort((a,c)=>c.z-a.z);geometryCache.set(scene,{palette,items});}
    for(const v of items){
      const p=v.points.map(project);
      if(p.every(q=>q[0]<-100)||p.every(q=>q[0]>W+100)||p.every(q=>q[1]<-100)||p.every(q=>q[1]>H+100))continue;
      if(v.points.length===2)b.line(p[0],p[1],v.stroke,v.width);
      else b.poly(p,v.fill,v.stroke,v.width);
    }
  }
  return {line,front,side,floor,box,paint,cached};
}
function building(b,x0,x1,z,height=8.1){
  const wall='#82809a',trim='#9494aa',glass='#242c40';
  b.front(x0,x1,0,height,z,wall);b.front(x0,x1,height-.13,height,z,trim,-.02);
  b.front(x0,x1,3.65,4.13,z,trim,-.02);b.front(x0+.38,x1-.38,.55,3.5,z,glass,-.03);
  b.front(x0+.38,x1-.38,1.25,1.34,z,'#116956',-.04);
  for(let x=x0+.7;x<x1-.35;x+=.65)b.line([x,.55,z],[x,3.5,z],'#121b2e',1.1,-.06);
  const n=Math.max(2,Math.floor((x1-x0)/2.4));
  for(let i=0;i<n;i++){
    const x=mix(x0+.45,x1-2.05,i/Math.max(1,n-1));
    b.front(x,x+1.7,5.15,6.8,z,'#121b2c',-.05);b.front(x,x+1.7,6.8,6.92,z,trim,-.06);
    for(let y=5.25;y<6.75;y+=.22)b.line([x,y,z],[x+1.7,y,z],'#464b62',1,-.08);
    for(let w=.15;w<1.65;w+=.35)b.line([x+w,5.1,z],[x+w,6.9,z],INK,1.5,-.08);
  }
  for(let x=x0+.2;x<x1;x+=2.4)b.line([x,4.14,z],[x,height,z],'#5b5b73',1,-.07);
  b.front(x1-1.16,x1-.42,5.02,6.92,z,'#b8b9c6',-.1);b.front(x1-1.08,x1-.52,5.18,6.72,z,'#20263a',-.11);
  b.front(x1-2,x1-1.48,5.48,6.71,z,'#a6a7bb',-.1);
  for(let w=0;w<4;w++)b.line([x1-1.97+w*.13,5.6,z],[x1-1.97+w*.13,6.6,z],'#41455d',1,-.12);
}
function sideBuilding(b,x,z0,z1,height){
  b.side(x,z0,z1,.1,height,'#77788f');
  for(let y=0;y<height;y+=1.15)b.line([x,y,z0],[x,y,z1],'#3e4154',.9,-.01);
  for(let z=z0;z<z1;z+=2.2){
    b.side(x,z+.16,Math.min(z+1.78,z1),1.25,3.55,'#273044',-.02);
    b.side(x,z+.16,Math.min(z+1.78,z1),1.64,1.72,'#0f6855',-.03);
    b.side(x,z+.2,Math.min(z+1.7,z1),5.12,6.6,'#1d2537',-.02);
    for(let y=5.23;y<6.56;y+=.25)b.line([x,y,z+.2],[x,y,Math.min(z+1.7,z1)],'#454962',.8,-.04);
    b.box(x<0?x-.22:x,x<0?x:x+.22,0,height+.2,z,z+.17,'#a09db1','#696c83');
  }
}
function cone(b,x,y,h,w){
  b.ellipse(x,y+2,w*.73,w*.14,'#20212a',null);
  b.poly([[x-w*.64,y],[x+w*.64,y],[x+w*.76,y+4],[x-w*.76,y+4]],'#723531');
  const top=y-h;
  b.poly([[x-2,top],[x+2,top],[x+w*.48,y],[x-w*.48,y]],'#c7341c');
  b.poly([[x+2,top],[x+w*.48,y],[x+w*.20,y],[x-1,top]],'#ee4a22',null);
  for(const [a,c] of [[.28,.4],[.57,.7]]){
    const wi=w*.48;b.poly([[x-wi*a,top+h*a],[x+wi*a,top+h*a],[x+wi*c,top+h*c],[x-wi*c,top+h*c]],'#e8e7de',null);
  }
  b.line([x-1,top],[x-w*.48,y],'#69272b',1);
}
function car(b,x,y,scale){
  const p=(a,c)=>[x+a*scale,y+c*scale];
  b.poly([p(-57,-71),p(-39,-120),p(41,-120),p(61,-68)],'#162845',INK,1.8);
  b.poly([p(-42,-75),p(-30,-112),p(33,-112),p(47,-75)],'#475169');
  b.poly([p(-64,-69),p(65,-69),p(66,-17),p(-65,-17)],'#1e3157',INK,1.8);
  b.poly([p(-64,-67),p(65,-67),p(67,-56),p(-66,-56)],'#34537c');
  b.rect(x-52*scale,y-49*scale,25*scale,10*scale,'#bec6d3');b.rect(x+28*scale,y-49*scale,25*scale,10*scale,'#bec6d3');
  b.rect(x-14*scale,y-33*scale,30*scale,11*scale,'#c9c9c5');
  b.rect(x-64*scale,y-16*scale,14*scale,16*scale,'#151b28');b.rect(x+49*scale,y-16*scale,14*scale,16*scale,'#151b28');
  b.line(p(-62,-22),p(64,-22),'#59697e',2);
}
function signalSign(b,x,y,s){
  b.rect(x-3*s,y-7*s,6*s,165*s,'#777b8e');
  for(let j=0;j<2;j++){
    const yy=y+j*52*s;
    b.ellipse(x,yy,20*s,20*s,'#655b9a','#abb3c8',2*s);b.ellipse(x,yy,15*s,15*s,null,'#e64c4e',2.4*s);
    b.line([x-11*s,yy-11*s],[x+11*s,yy+11*s],'#e64c4e',2.4*s);
    if(!j)b.line([x+11*s,yy-11*s],[x-11*s,yy+11*s],'#e64c4e',2.4*s);
    b.rect(x-17*s,yy+23*s,34*s,7*s,'#aaaab6');
  }
}
function crossing(ctx,state){
  const b=brush(ctx),p=projector(state,72,665),s=sceneBuilder(p,'crossing');
  b.rect(0,0,W,H,'#e73803',null);b.rect(0,665,W,55,'#1b202a',null);
  if(!s.cached){
    s.floor(-24,24,0,36,0,'#404857',1);s.floor(-5.7,5.7,0,34,.02,'#515764',.8);
    for(const [x0,x1] of [[-8.8,-5.7],[5.7,8.8]]){
      s.floor(x0,x1,0,34,.09,'#a5a6b7',.6);
      for(let x=x0;x<x1;x+=.55)s.line([x,.1,0],[x,.1,34],'#55596b',.75,.3);
      for(let z=0;z<34;z+=.65)s.line([x0,.1,z],[x1,.1,z],'#55596b',.75,.3);
      s.line([x0,.12,0],[x0,.12,34],'#c4c5ca',2,.2);
    }
    for(let z=.8;z<8.4;z+=.67)s.floor(-3.65,3.7,z,z+.29,.031,'#eeece7',.01);
    for(let x=-8.8;x<8.5;x+=1)s.floor(x,x+.48,9.5,12.8,.04,'#dbd9d4',.1);
    s.floor(-3.65,3.7,.2,.54,.11,'#d4ac3f',-.02);
    for(let x=-3.5;x<3.7;x+=.24)s.line([x,.115,.2],[x,.115,.54],'#7f6b39',.6,-.03);
    building(s,-6.1,6.1,33,8);
    for(let z=29;z>=3;z-=6.5){
      sideBuilding(s,-8.7,z,z+6.3,8+(z<10?2:0));sideBuilding(s,8.7,z,z+6.3,8.9);
      s.box(-8.7,-5.9,0,8,z,z+.6,'#85849e','#656981','#a7a6b8');s.box(5.9,8.7,0,8.8,z,z+.6,'#9190a7','#686c84','#a9a7bc');
      building(s,-8.7,-5.9,z-.02,8);building(s,5.9,8.7,z-.02,8.8);
      for(const sign of [-1,1]){
        const x=sign*6.7;s.box(x-.055,x+.055,0,8,z,z+.12,'#898b9e','#494d63');
        for(let y=6.1;y<=7.6;y+=.5)s.line([x,y,z],[x,y,z+6.5],INK,1.3,-.1);
        s.line([x-.5,7.2,z],[x+.5,7.2,z],'#2a2d41',1.4,-.1);
      }
      for(const sign of [-1,1]){
        const x=sign*7.1;s.box(x-.6,x+.6,.08,.65,z+1.2,z+2.5,'#a9abb9','#777e93','#bbc0cb');
        s.box(x-.57,x+.57,.65,1.03,z+1.2,z+2.5,'#237551','#154f42','#31815b');
      }
    }
    s.box(-6.13,-6.04,.1,9.6,.2,.32,'#999cab','#4d556e');s.box(3.8,3.97,.1,9.4,.6,.8,'#777d8d','#3b445b');
    s.front(3.8,3.97,1.75,4.3,.58,'#176d5d',-.02);
    for(let z=31;z>0;z-=5.5){
      s.line([-6.08,8.1,.2],[-6.7,7.4,z],INK,1.6,-.15);s.line([3.89,8.65,.7],[6.7,7.4,z],INK,1.6,-.15);
      s.line([3.89,8.22,.7],[6.7,6.9,z],INK,1.3,-.15);
    }
  }
  s.paint(b);
  let q=p([-8.2,.1,4]);car(b,q[0],q[1],mix(1.16,.64,state.depth));
  q=p([-5.7,.12,17]);if(state.depth>.5)car(b,q[0],q[1],.22);
  if(state.depth>.3){
    q=p([6.85,.15,14]);const k=.36;b.rect(q[0]-28*k,q[1]-125*k,57*k,125*k,'#253c72');
    b.rect(q[0]-20*k,q[1]-110*k,41*k,70*k,'#141f38');b.rect(q[0]-17*k,q[1]-31*k,18*k,7*k,'#adb7c6');
  }
  const cones=[];
  for(let i=0;i<5;i++){
    const x=state.layout?mix(-3.15,.35,i/4):mix(-3.9,2.55,i/4),z=state.layout?.9+i*1.7:.7;
    const q=p([x,.13,z]),k=state.layout?1/(1+z*.061):1;cones.push({q,k,z});
  }
  cones.sort((a,c)=>c.z-a.z);for(const {q,k} of cones)cone(b,q[0],q[1],120*k,57*k);
  q=p([5.5,.2,.05]);const r=p([10,.2,.05]),top=p([5.5,2.45,.05]);
  b.rect(q[0],top[1],r[0]-q[0],q[1]-top[1],null,INK,3.2);
  for(let x=5.65;x<10;x+=.32){const a=p([x,.2,.05]),c=p([x,2.45,.05]);b.line(a,c,INK,3);}
  q=p([5.22,6.3,.05]);signalSign(b,q[0],q[1],1);
  q=p([-6.08,9.1,.2]);b.rect(q[0]-125,q[1]-18,113,34,'#a1a5b1',INK,2);b.rect(q[0]-117,q[1]-12,97,21,'#9198a7',INK,1);
  q=p([3.88,8.95,.62]);b.rect(q[0]-54,q[1]-10,40,22,'#687181');b.ellipse(q[0]-39,q[1],6,7,'#212d43',null);
  b.ellipse(q[0]-23,q[1],6,7,'#df462f',null);b.rect(0,695,W,25,'#171b23',null);
}
function train(b,x,y,k,c){
  const p=(a,v)=>[x+a*k,y+v*k],outline=c.ink;
  b.poly([p(-115,0),p(-119,-322),p(-104,-382),p(99,-382),p(117,-353),p(120,0)],c.body,outline,2);
  b.poly([p(-106,-275),p(-106,-354),p(103,-354),p(106,-275)],c.window,outline,2);
  b.rect(x-98*k,y-340*k,181*k,31*k,c.window,outline,1.3);b.line(p(-83,-309),p(100,-309),c.line,1);
  b.poly([p(-104,-274),p(104,-274),p(108,-128),p(-108,-128)],c.window,outline,1.5);
  b.line(p(-78,-274),p(-78,-135),c.line,1.1);b.line(p(11,-274),p(11,-135),c.line,1.1);
  b.rect(x-111*k,y-126*k,223*k,50*k,c.accent,outline,1.5);b.rect(x-114*k,y-72*k,227*k,52*k,c.body,outline,1.5);
  b.rect(x-94*k,y-61*k,54*k,23*k,'#d4dcca',outline,1.5);b.rect(x+47*k,y-61*k,54*k,23*k,'#d4dcca',outline,1.5);
  b.poly([p(-114,-19),p(116,-19),p(87,8),p(58,8),p(43,-6),p(-44,-6),p(-57,8),p(-92,8)],c.accent,outline,1.3);
  b.rect(x-34*k,y-17*k,66*k,29*k,c.window,outline,1.4);b.poly([p(-28,-13),p(26,-13),p(18,9),p(-23,9)],'#4a5560',outline,1.2);
  b.line(p(-119,-354),p(111,-354),c.line,1.1);
}
function station(ctx,state){
  const blue=state.blue;
  const c={
    wall:color('#dee3e9','#b1d0ce',blue),tile:color('#c6cdd5','#a9c9c8',blue),
    floor:color('#bec9cf','#adcaca',blue),dark:color('#161f22','#47a3c5',blue),
    accent:color('#674ee3','#56aaca',blue),body:color('#a4afb6','#b2cccf',blue),
    window:color('#1a2230','#95bdc7',blue),ink:color('#303641','#456367',blue),
    line:color('#64717e','#537f85',blue),
  };
  const b=brush(ctx),p=projector(state,73,657),s=sceneBuilder(p,'station',blue);
  b.rect(0,0,W,H,c.dark,null);
  if(!s.cached){
    s.floor(-9,9.4,0,47,0,'#545e65',2);
    for(let z=0;z<47;z+=.65)s.floor(2.1,6.7,z,z+.18,.03,color('#748186','#8daeb1',blue),.1);
    for(const x of [2.8,5.9]){
      s.floor(x-.06,x+.06,0,47,.06,'#cad0cf');s.line([x,.1,0],[x,.1,47],c.ink,1.4,-.1);
    }
    s.floor(-9,1.7,0,47,.28,c.floor);
    for(let z=0;z<47;z+=.95){
      s.line([-9,.29,z],[1.7,.29,z],c.line,.72,-.1);
      for(let x=-9;x<1.7;x+=.95)s.line([x,.29,z],[x,.29,z+.95],c.line,.72,-.1);
    }
    s.floor(1.2,1.7,0,47,.30,color('#e0bf51','#c7bb79',blue),-.12);
    for(let z=0;z<47;z+=.35)s.line([1.2,.32,z],[1.7,.32,z],c.ink,.65,-.2);
    s.front(-9,1.7,-.4,.26,0,color('#303f48','#409dc0',blue));
    s.side(9.4,0,47,.1,9,c.wall);s.side(-9,0,47,.1,9,c.wall);s.floor(-9,9.4,0,47,9,c.tile,1);
    for(let z=0;z<47;z+=1.1){
      for(let y=.1;y<9;y+=1.05){
        const fill=(Math.floor(z/1.1)+Math.floor(y/1.05))%4===0?c.tile:c.wall;
        s.side(9.39,z,z+1.1,y,Math.min(y+1.05,9),fill,-.02);
      }
      s.side(9.36,z,z+1.1,5.72,6.05,c.accent,-.08);
    }
    s.front(-9,9.4,0,9,47,c.dark);
    for(let z=44;z>=0;z-=3.3){
      s.box(-9,9.4,8.68,8.89,z,z+.14,c.line,c.line,c.tile);
      for(let x=-8;x<9.4;x+=2.5)s.box(x,x+.06,8.93,9.05,z,z+3.3,c.line);
      for(const x of [-5.6,1.1]){
        s.floor(x,x+.12,z,z+1.6,8.52,color('#eef0df','#afc9bf',blue),-.1);s.line([x,8.47,z],[x,8.47,z+1.6],c.ink,1,-.2);
      }
    }
    for(let i=16;i>=0;i--){
      const z=2+i*.45,y=.28+i*.27;
      s.floor(-9,-5.65,z,z+.45,y+.27,color('#667276','#a4c5c2',blue),-.25);
      s.front(-9,-5.65,y,y+.27,z,color('#454f55','#a0bebb',blue),-.26);s.line([-9,y+.27,z],[-5.65,y+.27,z],c.line,.9,-.3);
    }
    s.line([-8.6,1.32,2],[-8.6,5.8,9.6],c.line,2.8,-.35);s.front(-8.3,-6.75,4.3,5.7,4.1,color('#343d43','#9bbbbb',blue),-.2);
    s.box(2.65,6.28,.14,5.46,12,45,c.body,c.body,c.body);
    for(let z=12;z<45;z+=3.05){
      s.side(2.64,z+.35,z+2.5,2,4.67,c.window,-.08);s.side(2.61,z,z+3.05,1.17,1.67,c.accent,-.1);
      s.side(2.6,z+.66,z+1.7,.6,4.73,c.body,-.12);s.side(2.59,z+.74,z+1.59,2.1,4.52,c.window,-.15);
    }
    for(let z=38;z>=6;z-=3.3){
      s.box(1.83,2.04,.28,4.65,z,z+.35,c.body,c.line);s.side(1.85,z+.35,z+3.3,.62,4.03,c.window,-.15);
      s.side(1.84,z+.35,z+3.3,1.56,2.0,c.accent,-.16);
    }
    for(let z=42;z>=0;z-=5.25){
      s.box(-4.12,-3.43,.28,9,z,z+.55,c.wall,c.tile);
      for(let x=-4.07;x<-3.44;x+=.105)s.line([x,.28,z],[x,9,z],c.line,.85,-.1);
      s.front(-4.12,-3.43,3.98,4.68,z,c.wall,-.12);s.front(-4.12,-3.43,4.6,4.68,z,c.accent,-.14);
      s.front(-4.12,-3.43,3.98,4.06,z,c.accent,-.14);s.front(-4.12,-3.43,.28,.42,z,c.accent,-.14);
      s.front(-2.53,.32,8.02,8.56,z,c.body,-.08);s.front(-1.52,.25,8.06,8.52,z,color('#f2d53a','#67acb9',blue),-.12);
      s.line([-2.52,8.72,z],[-2.52,8.56,z],c.ink,1.6,-.1);s.line([.31,8.72,z],[.31,8.56,z],c.ink,1.6,-.1);
      s.front(-2.36,-1.65,8.16,8.25,z,c.line,-.14);s.front(-2.36,-1.83,8.32,8.38,z,c.line,-.14);
    }
  }
  s.paint(b);
  const q=p([4.6,.12,12]),k=1/(1+12*.105*state.depth);train(b,q[0],q[1],k,c);
  const a=p([1.96,.29,1.2]),t=p([1.96,4.63,1.2]);
  b.rect(a[0]-11,t[1],23,a[1]-t[1],c.body,c.ink,1.4);b.rect(a[0]-7,t[1]+7,10,a[1]-t[1]-15,c.line,c.ink,1);
  b.rect(0,700,W,20,'#141a20',null);
}
export function renderPerspective(ctx,scene,time){
  const state=perspectiveState(scene,time);
  ctx.save();ctx.setTransform(ctx.canvas.width/W,0,0,ctx.canvas.height/H,0,0);
  ctx.clearRect(0,0,W,H);(scene==='station'?station:crossing)(ctx,state);
  ctx.restore();return state;
}
