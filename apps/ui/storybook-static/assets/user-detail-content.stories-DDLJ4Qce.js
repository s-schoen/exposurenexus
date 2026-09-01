import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{r as i,t as a}from"./button-CUM85oiu.js";import{c as o,d as s}from"./common-YwcRYf10.js";import{o as c,t as l}from"./lucide-react-gLHBi0xA.js";import{i as u,r as d}from"./role-fixtures-9ejvWuBf.js";import{i as f,o as p}from"./storybook-fixtures-FiAZrqXQ.js";import{a as m,i as h,n as g,r as _}from"./storybook-utils-ByWtnJxJ.js";import{n as v,t as y}from"./user-detail-content-DacsOCZi.js";function b({scenario:e,user:t}){let n=e===`disabled`?C:e===`no-roles`?w:t,r=(0,x.useMemo)(()=>{let t=h();return e!==`loading`&&e!==`error`&&t.setQueryData([`users`,n.id],n),e!==`loading`&&e!==`roles-loading`&&t.setQueryData([`roles`],d),t},[n,e]),[i,o]=(0,x.useState)(e!==`loading`&&e!==`error`&&e!==`roles-loading`);return(0,x.useLayoutEffect)(()=>{let t=globalThis.fetch;return globalThis.fetch=async(r,i)=>{let a=r instanceof Request?r.url:String(r);return a.endsWith(`/api/users/${n.id}`)?e===`loading`?await new Promise(()=>{}):e===`error`?new Response(JSON.stringify({error:`User not found`}),{status:404,headers:{"Content-Type":`application/json`}}):_(n):a.endsWith(`/api/roles`)?e===`roles-loading`?await new Promise(()=>{}):g(d):t(r,i)},o(!0),()=>{globalThis.fetch=t}},[n,e]),i?(0,S.jsx)(s,{client:r,children:(0,S.jsx)(`div`,{className:`w-full max-w-7xl`,children:(0,S.jsx)(y,{userId:n.id,titleAction:(0,S.jsxs)(a,{type:`button`,variant:`outline`,size:`sm`,children:[(0,S.jsx)(c,{}),`Edit user`]})})})}):null}var x,S,C,w,T,E,D,O,k,A,j,M;t((()=>{x=e(n(),1),o(),l(),v(),u(),p(),i(),m(),S=r(),C={...f[2],roleIds:[d[0].id,`11111111-1111-4111-8111-111111111111`]},w={...f[1],roleIds:[]},T={title:`Resources/Users/Detail`,component:b,parameters:{layout:`padded`},args:{user:f[1],scenario:`success`},argTypes:{scenario:{control:`radio`,options:[`success`,`disabled`,`no-roles`,`roles-loading`,`loading`,`error`]}},render:e=>(0,S.jsx)(b,{...e})},E={},D={args:{scenario:`disabled`}},O={args:{scenario:`no-roles`}},k={args:{scenario:`roles-loading`}},A={args:{scenario:`loading`}},j={args:{scenario:`error`}},E.parameters={...E.parameters,docs:{...E.parameters?.docs,source:{originalSource:`{}`,...E.parameters?.docs?.source}}},D.parameters={...D.parameters,docs:{...D.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "disabled"
  }
}`,...D.parameters?.docs?.source}}},O.parameters={...O.parameters,docs:{...O.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "no-roles"
  }
}`,...O.parameters?.docs?.source}}},k.parameters={...k.parameters,docs:{...k.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "roles-loading"
  }
}`,...k.parameters?.docs?.source}}},A.parameters={...A.parameters,docs:{...A.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "loading"
  }
}`,...A.parameters?.docs?.source}}},j.parameters={...j.parameters,docs:{...j.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "error"
  }
}`,...j.parameters?.docs?.source}}},M=[`EnabledUser`,`DisabledUser`,`NoRoles`,`RolesLoading`,`Loading`,`ErrorState`]}))();export{D as DisabledUser,E as EnabledUser,j as ErrorState,A as Loading,O as NoRoles,k as RolesLoading,M as __namedExportsOrder,T as default};