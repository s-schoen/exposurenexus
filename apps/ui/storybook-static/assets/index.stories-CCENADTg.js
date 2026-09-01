import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{i,r as a}from"./role-fixtures-9ejvWuBf.js";import{i as o,o as s}from"./storybook-fixtures-FiAZrqXQ.js";import{a as c,i as l,n as u,t as d}from"./storybook-utils-ByWtnJxJ.js";import{n as f,t as p}from"./user-table-C2XVqA65.js";function m({users:e,scenario:t,selectedUserId:n,onSelectUser:r,onCreateUser:i}){let o=t===`empty`?[]:e,s=(0,h.useMemo)(()=>{let e=l();return t!==`loading`&&e.setQueryData([`users`],o),t!==`loading`&&t!==`roles-loading`&&e.setQueryData([`roles`],a),e},[o,t]),[c,f]=(0,h.useState)(t!==`loading`&&t!==`roles-loading`);return(0,h.useLayoutEffect)(()=>{let e=globalThis.fetch;return globalThis.fetch=async(n,r)=>{let i=n instanceof Request?n.url:String(n);return i.endsWith(`/api/users`)?t===`loading`?await new Promise(()=>{}):u(o):i.endsWith(`/api/roles`)?t===`loading`||t===`roles-loading`?await new Promise(()=>{}):u(a):e(n,r)},f(!0),()=>{globalThis.fetch=e}},[o,t]),c?(0,g.jsx)(d,{queryClient:s,initialPath:`/users`,withNuqs:!0,children:(0,g.jsx)(`div`,{className:`w-full max-w-6xl`,children:(0,g.jsx)(p,{selectedUserId:n,onSelectUser:r,onCreateUser:i})})}):null}var h,g,_,v,y,b,x,S,C,w,T,E;t((()=>{h=e(n(),1),f(),i(),s(),c(),g=r(),{fn:_}=__STORYBOOK_MODULE_TEST__,v={title:`Resources/Users/Table`,component:m,tags:[`!test`],parameters:{layout:`padded`},args:{users:o,scenario:`default`},argTypes:{scenario:{control:`radio`,options:[`default`,`empty`,`loading`,`roles-loading`]}},render:e=>(0,g.jsx)(m,{...e})},y={},b={args:{scenario:`empty`}},x={args:{scenario:`loading`}},S={args:{scenario:`roles-loading`}},C={args:{selectedUserId:o[1].id}},w={args:{onCreateUser:_()}},T={args:{onSelectUser:_()}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{}`,...y.parameters?.docs?.source}}},b.parameters={...b.parameters,docs:{...b.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "empty"
  }
}`,...b.parameters?.docs?.source}}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "loading"
  }
}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "roles-loading"
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    selectedUserId: STORY_USERS[1].id
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    onCreateUser: fn()
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    onSelectUser: fn()
  }
}`,...T.parameters?.docs?.source}}},E=[`Default`,`Empty`,`Loading`,`RolesLoading`,`ActiveRow`,`Creatable`,`Selectable`]}))();export{C as ActiveRow,w as Creatable,y as Default,b as Empty,x as Loading,S as RolesLoading,T as Selectable,E as __namedExportsOrder,v as default};