(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[8107],{12162:(e,t,r)=>{"use strict";r.r(t),r.d(t,{assets:()=>d,contentTitle:()=>a,default:()=>h,frontMatter:()=>c,metadata:()=>l,toc:()=>u});var n=r(52322),s=r(45392),o=r(20477),i=r(61376);const c={sidebar_position:4},a="Cursor objects",l={id:"implementation-guides/pointers/types/cursors",title:"Cursor objects",description:"The core functionality that @ethdebug/pointers provides is the",source:"@site/docs/implementation-guides/pointers/types/cursors.mdx",sourceDirName:"implementation-guides/pointers/types",slug:"/implementation-guides/pointers/types/cursors",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/types/cursors",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/types/cursors.mdx",tags:[],version:"current",sidebarPosition:4,frontMatter:{sidebar_position:4},sidebar:"docsSidebar",previous:{title:"Data and machines",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/types/data-and-machines"},next:{title:"Reading from pointer regions",permalink:"/format/pr-preview/pr-149/docs/implementation-guides/pointers/reading-from-regions"}},d={},u=[{value:"Cursor views and regions",id:"cursor-views-and-regions",level:2}];function p(e){const t={code:"code",em:"em",h1:"h1",h2:"h2",li:"li",p:"p",strong:"strong",ul:"ul",...(0,s.a)(),...e.components};return(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(t.h1,{id:"cursor-objects",children:"Cursor objects"}),"\n",(0,n.jsxs)(t.p,{children:["The core functionality that ",(0,n.jsx)(t.strong,{children:"@ethdebug/pointers"})," provides is the\n",(0,n.jsx)(t.code,{children:"dereference(pointer: Pointer)"})," function. This function returns a ",(0,n.jsx)(t.code,{children:"Cursor"}),"\nobject."]}),"\n",(0,n.jsx)(i.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/cursor.ts",extract:e=>e.getExportedDeclarations().get("Cursor").find((e=>e.getKind()===o.lGB.InterfaceDeclaration))}),"\n",(0,n.jsxs)(t.p,{children:["A ",(0,n.jsx)(t.code,{children:"Cursor"})," represents the closure around some pointer, generating concrete\ninformation about data locations and bytes ",(0,n.jsx)(t.em,{children:"only in consideration of"}),"\na particular machine state."]}),"\n",(0,n.jsx)(t.h2,{id:"cursor-views-and-regions",children:"Cursor views and regions"}),"\n",(0,n.jsxs)(t.p,{children:["Viewing a ",(0,n.jsx)(t.code,{children:"Cursor"})," with a machine state yields two key results:"]}),"\n",(0,n.jsxs)(t.ul,{children:["\n",(0,n.jsxs)(t.li,{children:["\n",(0,n.jsxs)(t.p,{children:["A collection of ",(0,n.jsx)(t.code,{children:"Cursor.Region"})," objects representing the pointer in\nterms of fully-evaluated slots, offsets, conditionals, etc."]}),"\n"]}),"\n",(0,n.jsxs)(t.li,{children:["\n",(0,n.jsxs)(t.p,{children:["A ",(0,n.jsx)(t.code,{children:"read(region: Cursor.Region): Promise<Data>"})," method for reading\nbytes from the machine"]}),"\n"]}),"\n"]}),"\n",(0,n.jsxs)(t.p,{children:[(0,n.jsx)(t.strong,{children:"Importantly"}),", a ",(0,n.jsx)(t.code,{children:"Cursor.Region"})," is a fully-evaluated\n",(0,n.jsx)(t.code,{children:"Pointer.Region"}),". While the schema allows pointer regions to\ndefine their slots, offsets, lengths, etc. using complex expressions that\ncan reference internal variables and other regions, a ",(0,n.jsx)(t.code,{children:"Cursor.Region"}),"\nrepresents the runtime result of evaluating all these expressions: a\nspecific range of bytes in a specific data location."]}),"\n",(0,n.jsxs)(t.p,{children:["The full listing of ",(0,n.jsx)(t.code,{children:"namespace Cursor"})," follows:"]}),"\n",(0,n.jsx)(i.Z,{packageName:"@ethdebug/pointers",sourcePath:"src/cursor.ts",extract:e=>e.getExportedDeclarations().get("Cursor").find((e=>e.getKind()===o.lGB.ModuleDeclaration))})]})}function h(e={}){const{wrapper:t}={...(0,s.a)(),...e.components};return t?(0,n.jsx)(t,{...e,children:(0,n.jsx)(p,{...e})}):p(e)}},48313:e=>{function t(e){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=48313,e.exports=t},61376:(e,t,r)=>{"use strict";r.d(t,{Z:()=>m});var n=r(84560),s=r.n(n),o=r(20477),i=r(42408);var c=r(2784),a=r(27718),l=r(52322);function d(e){let{code:t,links:r,...n}=e;const o=(0,c.useRef)(null),[i,a]=(0,c.useState)(null);return(0,c.useEffect)((()=>{function e(){if(o.current){const e=o.current.querySelector("pre > code");if(e){const t=Array.from(e.childNodes).flatMap((e=>u(e,r)));a((0,l.jsx)("pre",{className:e.parentElement?.className,children:(0,l.jsx)("code",{className:e.className,children:t})}))}}}e();const t=new MutationObserver(e);return o.current&&t.observe(o.current,{childList:!0,subtree:!0}),()=>t.disconnect()}),[t,r]),i||(0,l.jsx)("div",{ref:o,children:(0,l.jsx)(s(),{...n,children:t})})}function u(e,t){return e.nodeType===Node.TEXT_NODE?function(e,t){const r=[];let n=e.textContent||"",s=0;for(const[o,i]of Object.entries(t)){let e=n.indexOf(o,s);for(;-1!==e;)e>s&&r.push(n.slice(s,e)),r.push((0,l.jsx)(a.Z,{to:i,className:"linked-code-block-link",children:o},`${o}-${e}`)),s=e+o.length,e=n.indexOf(o,s)}s<n.length&&r.push(n.slice(s));return r}(e,t):e.nodeType===Node.ELEMENT_NODE?function(e,t){const r=e.tagName.toLowerCase(),n={key:p++,className:e.className};e.style&&e.style.cssText&&(n.style=function(e){const t={};for(const r of e.split(";"))if(r){const[e,n]=r.split(":");if(e&&n){t[e.trim().replace(/-./g,(e=>e[1].toUpperCase()))]=n.trim()}}return t}(e.style.cssText));if(h.has(r))return c.createElement(r,n);const s=Array.from(e.childNodes).flatMap((e=>u(e,t)));return c.createElement(r,n,s)}(e,t):[]}let p=0;const h=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);function m(e){let{packageName:t,sourcePath:r,includePackageNameInTitle:n=!1,extract:c,links:a={},...u}=e;const p=function(e){const{packages:t}=(0,i.eZ)("project-code-plugin");if(!(e in t))throw new Error(`Unknown package name ${e}`);const{sourceFiles:r}=t[e],n=new o.IKL({useInMemoryFileSystem:!0});for(const{filePath:s,text:o}of r)n.createSourceFile(s,o,{overwrite:!0});return n}(t),h=p.getSourceFileOrThrow(r),m=c?c(h,p):h,f=m.getFullText().trim(),g=!c,x=n?(0,l.jsxs)(l.Fragment,{children:[(0,l.jsx)("strong",{children:t})," ",r]}):r;return Object.keys(a).length>0?(0,l.jsx)(d,{code:f,links:a,language:"typescript",...u}):(0,l.jsx)(s(),{language:"typescript",...g?{title:x,showLineNumbers:!0}:{showLineNumbers:!1},...u,children:m.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);