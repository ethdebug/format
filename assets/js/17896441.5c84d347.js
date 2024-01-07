"use strict";(self.webpackChunk_ethdebug_format_web=self.webpackChunk_ethdebug_format_web||[]).push([[918],{7255:(e,t,a)=>{a.d(t,{Z:()=>v});a(2784);var s=a(489),n=a(211),l=a(8350),i=a(7661),o=a(7718),d=a(1077),r=a(77),c=a(2322);function u(e){return(0,c.jsx)("svg",{viewBox:"0 0 24 24",...e,children:(0,c.jsx)("path",{d:"M10 19v-5h4v5c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-7h1.7c.46 0 .68-.57.33-.87L12.67 3.6c-.38-.34-.96-.34-1.34 0l-8.36 7.53c-.34.3-.13.87.33.87H5v7c0 .55.45 1 1 1h3c.55 0 1-.45 1-1z",fill:"currentColor"})})}const h={breadcrumbHomeIcon:"breadcrumbHomeIcon_JFrk"};function m(){const e=(0,r.Z)("/");return(0,c.jsx)("li",{className:"breadcrumbs__item",children:(0,c.jsx)(o.Z,{"aria-label":(0,d.translate)({id:"theme.docs.breadcrumbs.home",message:"Home page",description:"The ARIA label for the home page in the breadcrumbs"}),className:"breadcrumbs__link",href:e,children:(0,c.jsx)(u,{className:h.breadcrumbHomeIcon})})})}const b={breadcrumbsContainer:"breadcrumbsContainer_zCmv"};function p(e){let{children:t,href:a,isLast:s}=e;const n="breadcrumbs__link";return s?(0,c.jsx)("span",{className:n,itemProp:"name",children:t}):a?(0,c.jsx)(o.Z,{className:n,href:a,itemProp:"item",children:(0,c.jsx)("span",{itemProp:"name",children:t})}):(0,c.jsx)("span",{className:n,children:t})}function x(e){let{children:t,active:a,index:n,addMicrodata:l}=e;return(0,c.jsxs)("li",{...l&&{itemScope:!0,itemProp:"itemListElement",itemType:"https://schema.org/ListItem"},className:(0,s.Z)("breadcrumbs__item",{"breadcrumbs__item--active":a}),children:[t,(0,c.jsx)("meta",{itemProp:"position",content:String(n+1)})]})}function v(){const e=(0,l.s1)(),t=(0,i.Ns)();return e?(0,c.jsx)("nav",{className:(0,s.Z)(n.k.docs.docBreadcrumbs,b.breadcrumbsContainer),"aria-label":(0,d.translate)({id:"theme.docs.breadcrumbs.navAriaLabel",message:"Breadcrumbs",description:"The ARIA label for the breadcrumbs"}),children:(0,c.jsxs)("ul",{className:"breadcrumbs",itemScope:!0,itemType:"https://schema.org/BreadcrumbList",children:[t&&(0,c.jsx)(m,{}),e.map(((t,a)=>{const s=a===e.length-1,n="category"===t.type&&t.linkUnlisted?void 0:t.href;return(0,c.jsx)(x,{active:s,index:a,addMicrodata:!!n,children:(0,c.jsx)(p,{href:n,isLast:s,children:t.label})},a)}))]})}):null}},864:(e,t,a)=>{a.r(t),a.d(t,{default:()=>Q});var s=a(2784),n=a(328),l=a(6335),i=a(2322);const o=s.createContext(null);function d(e){let{children:t,content:a}=e;const n=function(e){return(0,s.useMemo)((()=>({metadata:e.metadata,frontMatter:e.frontMatter,assets:e.assets,contentTitle:e.contentTitle,toc:e.toc})),[e])}(a);return(0,i.jsx)(o.Provider,{value:n,children:t})}function r(){const e=(0,s.useContext)(o);if(null===e)throw new l.i6("DocProvider");return e}function c(){const{metadata:e,frontMatter:t,assets:a}=r();return(0,i.jsx)(n.d,{title:e.title,description:e.description,keywords:t.keywords,image:a.image??t.image})}var u=a(489),h=a(7963),m=a(301);function b(){const{metadata:e}=r();return(0,i.jsx)(m.Z,{previous:e.previous,next:e.next})}var p=a(2269),x=a(8541),v=a(211),g=a(1077);function j(e){let{lastUpdatedAt:t,formattedLastUpdatedAt:a}=e;return(0,i.jsx)(g.default,{id:"theme.lastUpdated.atDate",description:"The words used to describe on which date a page has been last updated",values:{date:(0,i.jsx)("b",{children:(0,i.jsx)("time",{dateTime:new Date(1e3*t).toISOString(),children:a})})},children:" on {date}"})}function f(e){let{lastUpdatedBy:t}=e;return(0,i.jsx)(g.default,{id:"theme.lastUpdated.byUser",description:"The words used to describe by who the page has been last updated",values:{user:(0,i.jsx)("b",{children:t})},children:" by {user}"})}function _(e){let{lastUpdatedAt:t,formattedLastUpdatedAt:a,lastUpdatedBy:s}=e;return(0,i.jsxs)("span",{className:v.k.common.lastUpdated,children:[(0,i.jsx)(g.default,{id:"theme.lastUpdated.lastUpdatedAtBy",description:"The sentence used to display when a page has been last updated, and by who",values:{atDate:t&&a?(0,i.jsx)(j,{lastUpdatedAt:t,formattedLastUpdatedAt:a}):"",byUser:s?(0,i.jsx)(f,{lastUpdatedBy:s}):""},children:"Last updated{atDate}{byUser}"}),!1]})}var N=a(7718);const C={iconEdit:"iconEdit_UohW"};function L(e){let{className:t,...a}=e;return(0,i.jsx)("svg",{fill:"currentColor",height:"20",width:"20",viewBox:"0 0 40 40",className:(0,u.Z)(C.iconEdit,t),"aria-hidden":"true",...a,children:(0,i.jsx)("g",{children:(0,i.jsx)("path",{d:"m34.5 11.7l-3 3.1-6.3-6.3 3.1-3q0.5-0.5 1.2-0.5t1.1 0.5l3.9 3.9q0.5 0.4 0.5 1.1t-0.5 1.2z m-29.5 17.1l18.4-18.5 6.3 6.3-18.4 18.4h-6.3v-6.2z"})})})}function k(e){let{editUrl:t}=e;return(0,i.jsxs)(N.Z,{to:t,className:v.k.common.editThisPage,children:[(0,i.jsx)(L,{}),(0,i.jsx)(g.default,{id:"theme.common.editThisPage",description:"The link label to edit the current page",children:"Edit this page"})]})}const Z={tag:"tag_qE9H",tagRegular:"tagRegular_aHXt",tagWithCount:"tagWithCount_UC8q"};function U(e){let{permalink:t,label:a,count:s}=e;return(0,i.jsxs)(N.Z,{href:t,className:(0,u.Z)(Z.tag,s?Z.tagWithCount:Z.tagRegular),children:[a,s&&(0,i.jsx)("span",{children:s})]})}const T={tags:"tags_q74f",tag:"tag_lSC7"};function w(e){let{tags:t}=e;return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("b",{children:(0,i.jsx)(g.default,{id:"theme.tags.tagsListLabel",description:"The label alongside a tag list",children:"Tags:"})}),(0,i.jsx)("ul",{className:(0,u.Z)(T.tags,"padding--none","margin-left--sm"),children:t.map((e=>{let{label:t,permalink:a}=e;return(0,i.jsx)("li",{className:T.tag,children:(0,i.jsx)(U,{label:t,permalink:a})},a)}))})]})}const y={lastUpdated:"lastUpdated_T23F"};function A(e){return(0,i.jsx)("div",{className:(0,u.Z)(v.k.docs.docFooterTagsRow,"row margin-bottom--sm"),children:(0,i.jsx)("div",{className:"col",children:(0,i.jsx)(w,{...e})})})}function B(e){let{editUrl:t,lastUpdatedAt:a,lastUpdatedBy:s,formattedLastUpdatedAt:n}=e;return(0,i.jsxs)("div",{className:(0,u.Z)(v.k.docs.docFooterEditMetaRow,"row"),children:[(0,i.jsx)("div",{className:"col",children:t&&(0,i.jsx)(k,{editUrl:t})}),(0,i.jsx)("div",{className:(0,u.Z)("col",y.lastUpdated),children:(a||s)&&(0,i.jsx)(_,{lastUpdatedAt:a,formattedLastUpdatedAt:n,lastUpdatedBy:s})})]})}function M(){const{metadata:e}=r(),{editUrl:t,lastUpdatedAt:a,formattedLastUpdatedAt:s,lastUpdatedBy:n,tags:l}=e,o=l.length>0,d=!!(t||a||n);return o||d?(0,i.jsxs)("footer",{className:(0,u.Z)(v.k.docs.docFooter,"docusaurus-mt-lg"),children:[o&&(0,i.jsx)(A,{tags:l}),d&&(0,i.jsx)(B,{editUrl:t,lastUpdatedAt:a,lastUpdatedBy:n,formattedLastUpdatedAt:s})]}):null}var I=a(8698),E=a(6986);const H={tocCollapsibleButton:"tocCollapsibleButton_htYj",tocCollapsibleButtonExpanded:"tocCollapsibleButtonExpanded_pAh7"};function P(e){let{collapsed:t,...a}=e;return(0,i.jsx)("button",{type:"button",...a,className:(0,u.Z)("clean-btn",H.tocCollapsibleButton,!t&&H.tocCollapsibleButtonExpanded,a.className),children:(0,i.jsx)(g.default,{id:"theme.TOCCollapsible.toggleButtonLabel",description:"The label used by the button on the collapsible TOC component",children:"On this page"})})}const S={tocCollapsible:"tocCollapsible_O_Qc",tocCollapsibleContent:"tocCollapsibleContent_SlnY",tocCollapsibleExpanded:"tocCollapsibleExpanded_klrc"};function V(e){let{toc:t,className:a,minHeadingLevel:s,maxHeadingLevel:n}=e;const{collapsed:l,toggleCollapsed:o}=(0,I.u)({initialState:!0});return(0,i.jsxs)("div",{className:(0,u.Z)(S.tocCollapsible,!l&&S.tocCollapsibleExpanded,a),children:[(0,i.jsx)(P,{collapsed:l,onClick:o}),(0,i.jsx)(I.z,{lazy:!0,className:S.tocCollapsibleContent,collapsed:l,children:(0,i.jsx)(E.Z,{toc:t,minHeadingLevel:s,maxHeadingLevel:n})})]})}const D={tocMobile:"tocMobile_tjDr"};function R(){const{toc:e,frontMatter:t}=r();return(0,i.jsx)(V,{toc:e,minHeadingLevel:t.toc_min_heading_level,maxHeadingLevel:t.toc_max_heading_level,className:(0,u.Z)(v.k.docs.docTocMobile,D.tocMobile)})}var F=a(8188);function z(){const{toc:e,frontMatter:t}=r();return(0,i.jsx)(F.Z,{toc:e,minHeadingLevel:t.toc_min_heading_level,maxHeadingLevel:t.toc_max_heading_level,className:v.k.docs.docTocDesktop})}var q=a(3851),O=a(5480);function J(e){let{children:t}=e;const a=function(){const{metadata:e,frontMatter:t,contentTitle:a}=r();return t.hide_title||void 0!==a?null:e.title}();return(0,i.jsxs)("div",{className:(0,u.Z)(v.k.docs.docMarkdown,"markdown"),children:[a&&(0,i.jsx)("header",{children:(0,i.jsx)(q.Z,{as:"h1",children:a})}),(0,i.jsx)(O.Z,{children:t})]})}var W=a(7255),Y=a(5197);const G={docItemContainer:"docItemContainer_Rv5Z",docItemCol:"docItemCol_YAwJ"};function X(e){let{children:t}=e;const a=function(){const{frontMatter:e,toc:t}=r(),a=(0,h.i)(),s=e.hide_table_of_contents,n=!s&&t.length>0;return{hidden:s,mobile:n?(0,i.jsx)(R,{}):void 0,desktop:!n||"desktop"!==a&&"ssr"!==a?void 0:(0,i.jsx)(z,{})}}(),{metadata:{unlisted:s}}=r();return(0,i.jsxs)("div",{className:"row",children:[(0,i.jsxs)("div",{className:(0,u.Z)("col",!a.hidden&&G.docItemCol),children:[s&&(0,i.jsx)(Y.Z,{}),(0,i.jsx)(p.Z,{}),(0,i.jsxs)("div",{className:G.docItemContainer,children:[(0,i.jsxs)("article",{children:[(0,i.jsx)(W.Z,{}),(0,i.jsx)(x.Z,{}),a.mobile,(0,i.jsx)(J,{children:t}),(0,i.jsx)(M,{})]}),(0,i.jsx)(b,{})]})]}),a.desktop&&(0,i.jsx)("div",{className:"col col--3",children:a.desktop})]})}function Q(e){const t=`docs-doc-id-${e.content.metadata.id}`,a=e.content;return(0,i.jsx)(d,{content:e.content,children:(0,i.jsxs)(n.FG,{className:t,children:[(0,i.jsx)(c,{}),(0,i.jsx)(X,{children:(0,i.jsx)(a,{})})]})})}},301:(e,t,a)=>{a.d(t,{Z:()=>d});a(2784);var s=a(1077),n=a(489),l=a(7718),i=a(2322);function o(e){const{permalink:t,title:a,subLabel:s,isNext:o}=e;return(0,i.jsxs)(l.Z,{className:(0,n.Z)("pagination-nav__link",o?"pagination-nav__link--next":"pagination-nav__link--prev"),to:t,children:[s&&(0,i.jsx)("div",{className:"pagination-nav__sublabel",children:s}),(0,i.jsx)("div",{className:"pagination-nav__label",children:a})]})}function d(e){const{previous:t,next:a}=e;return(0,i.jsxs)("nav",{className:"pagination-nav docusaurus-mt-lg","aria-label":(0,s.translate)({id:"theme.docs.paginator.navAriaLabel",message:"Docs pages",description:"The ARIA label for the docs pagination"}),children:[t&&(0,i.jsx)(o,{...t,subLabel:(0,i.jsx)(s.default,{id:"theme.docs.paginator.previous",description:"The label used to navigate to the previous doc",children:"Previous"})}),a&&(0,i.jsx)(o,{...a,subLabel:(0,i.jsx)(s.default,{id:"theme.docs.paginator.next",description:"The label used to navigate to the next doc",children:"Next"}),isNext:!0})]})}},8541:(e,t,a)=>{a.d(t,{Z:()=>d});a(2784);var s=a(489),n=a(1077),l=a(211),i=a(5663),o=a(2322);function d(e){let{className:t}=e;const a=(0,i.E)();return a.badge?(0,o.jsx)("span",{className:(0,s.Z)(t,l.k.docs.docVersionBadge,"badge badge--secondary"),children:(0,o.jsx)(n.default,{id:"theme.docs.versionBadge.label",values:{versionLabel:a.label},children:"Version: {versionLabel}"})}):null}},2269:(e,t,a)=>{a.d(t,{Z:()=>x});a(2784);var s=a(489),n=a(7614),l=a(7718),i=a(1077),o=a(1215),d=a(211),r=a(7949),c=a(5663),u=a(2322);const h={unreleased:function(e){let{siteTitle:t,versionMetadata:a}=e;return(0,u.jsx)(i.default,{id:"theme.docs.versions.unreleasedVersionLabel",description:"The label used to tell the user that he's browsing an unreleased doc version",values:{siteTitle:t,versionLabel:(0,u.jsx)("b",{children:a.label})},children:"This is unreleased documentation for {siteTitle} {versionLabel} version."})},unmaintained:function(e){let{siteTitle:t,versionMetadata:a}=e;return(0,u.jsx)(i.default,{id:"theme.docs.versions.unmaintainedVersionLabel",description:"The label used to tell the user that he's browsing an unmaintained doc version",values:{siteTitle:t,versionLabel:(0,u.jsx)("b",{children:a.label})},children:"This is documentation for {siteTitle} {versionLabel}, which is no longer actively maintained."})}};function m(e){const t=h[e.versionMetadata.banner];return(0,u.jsx)(t,{...e})}function b(e){let{versionLabel:t,to:a,onClick:s}=e;return(0,u.jsx)(i.default,{id:"theme.docs.versions.latestVersionSuggestionLabel",description:"The label used to tell the user to check the latest version",values:{versionLabel:t,latestVersionLink:(0,u.jsx)("b",{children:(0,u.jsx)(l.Z,{to:a,onClick:s,children:(0,u.jsx)(i.default,{id:"theme.docs.versions.latestVersionLinkLabel",description:"The label used for the latest version suggestion link label",children:"latest version"})})})},children:"For up-to-date documentation, see the {latestVersionLink} ({versionLabel})."})}function p(e){let{className:t,versionMetadata:a}=e;const{siteConfig:{title:l}}=(0,n.Z)(),{pluginId:i}=(0,o.gA)({failfast:!0}),{savePreferredVersionName:c}=(0,r.J)(i),{latestDocSuggestion:h,latestVersionSuggestion:p}=(0,o.Jo)(i),x=h??(v=p).docs.find((e=>e.id===v.mainDocId));var v;return(0,u.jsxs)("div",{className:(0,s.Z)(t,d.k.docs.docVersionBanner,"alert alert--warning margin-bottom--md"),role:"alert",children:[(0,u.jsx)("div",{children:(0,u.jsx)(m,{siteTitle:l,versionMetadata:a})}),(0,u.jsx)("div",{className:"margin-top--md",children:(0,u.jsx)(b,{versionLabel:p.label,to:x.path,onClick:()=>c(p.name)})})]})}function x(e){let{className:t}=e;const a=(0,c.E)();return a.banner?(0,u.jsx)(p,{className:t,versionMetadata:a}):null}},1900:(e,t,a)=>{a.d(t,{Z:()=>h});a(2784);var s=a(1344),n=a(6901),l=a(8713),i=a(9929),o=a(1674),d=a(7143),r=a(9725),c=a(4442),u=a(2322);o.vI.add(d.vnX,r.mRB);const h={...n.Z,a:function(e){let{children:t,href:a,...n}=e;return(0,u.jsxs)(l.Z,{href:a,...n,children:[t,a&&!(0,s.Z)(a)&&(0,u.jsx)(c.Z,{})]})},Icon:i.G}}}]);