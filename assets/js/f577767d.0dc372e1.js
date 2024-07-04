(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[763],{65045:(e,t,n)=>{"use strict";n.r(t),n.d(t,{assets:()=>l,contentTitle:()=>c,default:()=>p,frontMatter:()=>o,metadata:()=>a,toc:()=>d});var i=n(52322),s=n(45392),r=n(61376);const o={sidebar_position:6},c="Observing the machine",a={id:"implementation-guides/pointers/testing/machine-observation",title:"Observing the machine",description:"These integration tests leverage the observeTrace() helper function to",source:"@site/docs/implementation-guides/pointers/testing/machine-observation.mdx",sourceDirName:"implementation-guides/pointers/testing",slug:"/implementation-guides/pointers/testing/machine-observation",permalink:"/format/docs/implementation-guides/pointers/testing/machine-observation",draft:!1,unlisted:!1,editUrl:"https://github.com/ethdebug/format/tree/main/packages/web/docs/implementation-guides/pointers/testing/machine-observation.mdx",tags:[],version:"current",sidebarPosition:6,frontMatter:{sidebar_position:6},sidebar:"docsSidebar",previous:{title:"Deploying contracts",permalink:"/format/docs/implementation-guides/pointers/testing/deployment"},next:{title:"Test cases",permalink:"/format/docs/implementation-guides/pointers/testing/test-cases/"}},l={},d=[{value:"Function implementation",id:"function-implementation",level:2},{value:"<code>interface ObserveTraceOptions&lt;V&gt;</code>",id:"interface-definition",level:2}];function h(e){const t={a:"a",code:"code",h1:"h1",h2:"h2",li:"li",p:"p",ul:"ul",...(0,s.a)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(t.h1,{id:"observing-the-machine",children:"Observing the machine"}),"\n",(0,i.jsxs)(t.p,{children:["These integration tests leverage the ",(0,i.jsx)(t.code,{children:"observeTrace<V>()"})," helper function to\nconsolidate the logic to setup and execute the testing of a particular example\npointer. This function is designed to simulate an EVM and repeatedly observe the\nresult of dererencing this pointer across each step in the machine trace."]}),"\n",(0,i.jsxs)(t.p,{children:["This function accepts a test case description in the form of an ",(0,i.jsx)(t.code,{children:"options"}),"\nargument of type ",(0,i.jsx)(t.code,{children:"ObserveTraceOptions"}),". In its simplest form, this object must\ncontain the following information:"]}),"\n",(0,i.jsxs)(t.ul,{children:["\n",(0,i.jsx)(t.li,{children:"The pointer to be dereferenced and viewed repeatedly"}),"\n",(0,i.jsx)(t.li,{children:"Solidity code for a contract whose constructor manages a variable to which the\npointer corresponds"}),"\n",(0,i.jsxs)(t.li,{children:["An ",(0,i.jsx)(t.code,{children:"observe({ regions, read }: Cursor.View): Promise<V>"})," function that\nconverts a cursor view into a native JavaScript value of type ",(0,i.jsx)(t.code,{children:"V"})]}),"\n"]}),"\n",(0,i.jsxs)(t.p,{children:["With this information, the ",(0,i.jsx)(t.code,{children:"observeTrace<V>()"})," function initializes an in-memory\nEVM, compiles and deploys the Solidity contract, then steps through the code\nexecution of that contract's deployment. Over the course of this stepping, this\nfunction first dereferences the given ",(0,i.jsx)(t.code,{children:"pointer"})," and then repeatedly calls\n",(0,i.jsx)(t.code,{children:"observe()"})," with each new machine state. It aggregates all the changing values\nof type ",(0,i.jsx)(t.code,{children:"V"})," it observes and finally returns the full ",(0,i.jsx)(t.code,{children:"V[]"})," list of these values."]}),"\n",(0,i.jsxs)(t.p,{children:["This enables the integration tests to evaluate how a pointer gets dereferenced\nin native JavaScript terms, rather than just in the terms of a particular\nresolved collection of regions. For instance, this allows tests to specify that\nobserving a Solidity ",(0,i.jsx)(t.code,{children:"string storage"})," pointer should yield a list of JavaScript\n",(0,i.jsx)(t.code,{children:"string"})," values."]}),"\n",(0,i.jsxs)(t.p,{children:['Beyond the "simplest form" described above, ',(0,i.jsx)(t.code,{children:"ObserveTraceOptions"})," defines a\nnumber of optional properties for customizing observation behavior, including to\nallow observing pointers to complex types (e.g. arrays) and to allow skipping\nobservation at times where it may be unsafe. See ",(0,i.jsx)(t.a,{href:"#interface-definition",children:"below"}),"\nfor the full documented code listing for this type."]}),"\n",(0,i.jsx)(t.h2,{id:"function-implementation",children:"Function implementation"}),"\n",(0,i.jsxs)(t.p,{children:["The full implementation for ",(0,i.jsx)(t.code,{children:"observeTrace"})," follows:"]}),"\n",(0,i.jsx)(r.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/observe.ts",extract:e=>e.getFunction("observeTrace")}),"\n",(0,i.jsx)(t.h2,{id:"interface-definition",children:(0,i.jsx)(t.code,{children:"interface ObserveTraceOptions<V>"})}),"\n",(0,i.jsxs)(t.p,{children:["This interface is generic to some type ",(0,i.jsx)(t.code,{children:"V"}),":"]}),"\n",(0,i.jsx)(r.Z,{packageName:"@ethdebug/pointers",sourcePath:"test/observe.ts",extract:e=>e.getExportedDeclarations().get("ObserveTraceOptions")[0]})]})}function p(e={}){const{wrapper:t}={...(0,s.a)(),...e.components};return t?(0,i.jsx)(t,{...e,children:(0,i.jsx)(h,{...e})}):h(e)}},48313:e=>{function t(e){var t=new Error("Cannot find module '"+e+"'");throw t.code="MODULE_NOT_FOUND",t}t.keys=()=>[],t.resolve=t,t.id=48313,e.exports=t},61376:(e,t,n)=>{"use strict";n.d(t,{Z:()=>m});var i=n(84560),s=n.n(i),r=n(20477),o=n(42408);var c=n(2784),a=n(27718),l=n(52322);function d(e){let{code:t,links:n,...i}=e;const r=(0,c.useRef)(null),[o,a]=(0,c.useState)(null);return(0,c.useEffect)((()=>{function e(){if(r.current){const e=r.current.querySelector("pre > code");if(e){const t=Array.from(e.childNodes).flatMap((e=>h(e,n)));a((0,l.jsx)("pre",{className:e.parentElement?.className,children:(0,l.jsx)("code",{className:e.className,children:t})}))}}}e();const t=new MutationObserver(e);return r.current&&t.observe(r.current,{childList:!0,subtree:!0}),()=>t.disconnect()}),[t,n]),o||(0,l.jsx)("div",{ref:r,children:(0,l.jsx)(s(),{...i,children:t})})}function h(e,t){return e.nodeType===Node.TEXT_NODE?function(e,t){const n=[];let i=e.textContent||"",s=0;for(const[r,o]of Object.entries(t)){let e=i.indexOf(r,s);for(;-1!==e;)e>s&&n.push(i.slice(s,e)),n.push((0,l.jsx)(a.Z,{to:o,className:"linked-code-block-link",children:r},`${r}-${e}`)),s=e+r.length,e=i.indexOf(r,s)}s<i.length&&n.push(i.slice(s));return n}(e,t):e.nodeType===Node.ELEMENT_NODE?function(e,t){const n=e.tagName.toLowerCase(),i={key:p++,className:e.className};e.style&&e.style.cssText&&(i.style=function(e){const t={};for(const n of e.split(";"))if(n){const[e,i]=n.split(":");if(e&&i){t[e.trim().replace(/-./g,(e=>e[1].toUpperCase()))]=i.trim()}}return t}(e.style.cssText));if(u.has(n))return c.createElement(n,i);const s=Array.from(e.childNodes).flatMap((e=>h(e,t)));return c.createElement(n,i,s)}(e,t):[]}let p=0;const u=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);function m(e){let{packageName:t,sourcePath:n,extract:i,links:c={},...a}=e;const h=function(e){const{packages:t}=(0,o.eZ)("project-code-plugin");if(!(e in t))throw new Error(`Unknown package name ${e}`);const{sourceFiles:n}=t[e],i=new r.IKL({useInMemoryFileSystem:!0});for(const{filePath:s,text:r}of n)i.createSourceFile(s,r,{overwrite:!0});return i}(t),p=h.getSourceFileOrThrow(n),u=i?i(p,h):p,m=u.getFullText().trim(),f=!i;return Object.keys(c).length>0?(0,l.jsx)(d,{code:m,links:c,language:"typescript",...a}):(0,l.jsx)(s(),{language:"typescript",...f?{title:n,showLineNumbers:!0}:{showLineNumbers:!1},...a,children:u.getFullText().trim()})}},56699:()=>{},68379:()=>{},68382:()=>{},78867:()=>{},21212:()=>{},89854:()=>{},25800:()=>{},93037:()=>{},26996:()=>{}}]);