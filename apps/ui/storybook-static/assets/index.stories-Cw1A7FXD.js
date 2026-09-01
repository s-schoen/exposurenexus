import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{a as i,o as a}from"./storybook-fixtures-FiAZrqXQ.js";import{a as o,i as s,n as c,t as l}from"./storybook-utils-ByWtnJxJ.js";import{n as u,t as d}from"./vulnerability-table-BRt_fOaF.js";function f({vulnerabilities:e,scenario:t,selectedVulnerabilityId:n,onSelectVulnerability:r,onCreateVulnerability:i,onDeleteVulnerabilities:a}){let o=t===`empty`?[]:e,u=(0,p.useMemo)(()=>{let e=s();return t!==`loading`&&e.setQueryData([`vulnerabilities`],o),e},[o,t]),[f,h]=(0,p.useState)(t!==`loading`);return(0,p.useLayoutEffect)(()=>{let e=globalThis.fetch;return globalThis.fetch=async(n,r)=>(n instanceof Request?n.url:String(n)).endsWith(`/api/vulnerabilities`)?t===`loading`?await new Promise(()=>{}):c(o):e(n,r),h(!0),()=>{globalThis.fetch=e}},[o,t]),f?(0,m.jsx)(l,{queryClient:u,initialPath:`/vulnerabilities`,withNuqs:!0,children:(0,m.jsx)(`div`,{className:`w-full max-w-6xl`,children:(0,m.jsx)(d,{selectedVulnerabilityId:n,onSelectVulnerability:r,onCreateVulnerability:i,onDeleteVulnerabilities:a})})}):null}var p,m,h,g,_,v,y,b,x,S,C,w;t((()=>{p=e(n(),1),u(),a(),o(),m=r(),{fn:h}=__STORYBOOK_MODULE_TEST__,g={title:`Resources/Vulnerabilities/Table`,component:f,tags:[`!test`],parameters:{layout:`padded`},args:{vulnerabilities:i,scenario:`default`},argTypes:{scenario:{control:`radio`,options:[`default`,`empty`,`loading`]}},render:e=>(0,m.jsx)(f,{...e})},_={},v={args:{scenario:`empty`}},y={args:{scenario:`loading`}},b={args:{selectedVulnerabilityId:i[0].id}},x={args:{onCreateVulnerability:h()}},S={args:{onDeleteVulnerabilities:h(()=>Promise.resolve())}},C={args:{onSelectVulnerability:h()}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "empty"
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "loading"
  }
}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    selectedVulnerabilityId: STORY_VULNERABILITIES[0].id
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateVulnerability: fn()
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    onDeleteVulnerabilities: fn(() => Promise.resolve())
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    onSelectVulnerability: fn()
  }
}`,...C.parameters?.docs?.source}}},w=[`Default`,`Empty`,`Loading`,`ActiveRow`,`Creatable`,`Deletable`,`Selectable`]}))();export{b as ActiveRow,x as Creatable,_ as Default,S as Deletable,v as Empty,y as Loading,C as Selectable,w as __namedExportsOrder,g as default};