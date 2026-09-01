import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{c as i,d as a,p as o}from"./common-YwcRYf10.js";import{i as s,n as c,t as l}from"./role-fixtures-9ejvWuBf.js";import{n as u,t as d}from"./role-detail-content-CD-uo_4p.js";function f({roleId:e,role:t,scenario:n}){let r=(0,p.useMemo)(()=>{let r=new o({defaultOptions:{queries:{retry:!1,staleTime:1/0}}});return n===`success`&&r.setQueryData([`roles`,e],t),r},[t,e,n]),[i,s]=(0,p.useState)(n!==`loading`&&n!==`error`);return(0,p.useLayoutEffect)(()=>{if(n===`success`){s(!0);return}let t=globalThis.fetch;return globalThis.fetch=async(r,i)=>(r instanceof Request?r.url:String(r)).endsWith(`/api/roles/${e}`)?n===`loading`?await new Promise(()=>{}):new Response(JSON.stringify({error:`Role request failed`}),{status:500,headers:{"Content-Type":`application/json`}}):t(r,i),s(!0),()=>{globalThis.fetch=t}},[e,n]),i?(0,m.jsx)(a,{client:r,children:(0,m.jsx)(`div`,{className:`w-full max-w-6xl`,children:(0,m.jsx)(d,{roleId:e})})}):null}var p,m,h,g,_,v,y,b;t((()=>{i(),p=e(n(),1),s(),u(),m=r(),h={title:`Resources/Roles/Detail`,component:f,parameters:{layout:`padded`},args:{roleId:l.id,role:l,scenario:`success`},render:e=>(0,m.jsx)(f,{...e})},g={},_={args:{roleId:c.id,role:c}},v={args:{scenario:`loading`}},y={args:{scenario:`error`}},g.parameters={...g.parameters,docs:{...g.parameters?.docs,source:{originalSource:`{}`,...g.parameters?.docs?.source}}},_.parameters={..._.parameters,docs:{..._.parameters?.docs,source:{originalSource:`{
  args: {
    roleId: CUSTOM_AUDITOR_ROLE.id,
    role: CUSTOM_AUDITOR_ROLE
  }
}`,..._.parameters?.docs?.source}}},v.parameters={...v.parameters,docs:{...v.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "loading"
  }
}`,...v.parameters?.docs?.source}}},y.parameters={...y.parameters,docs:{...y.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "error"
  }
}`,...y.parameters?.docs?.source}}},b=[`BuiltInAdmin`,`CustomRole`,`Loading`,`ErrorState`]}))();export{g as BuiltInAdmin,_ as CustomRole,y as ErrorState,v as Loading,b as __namedExportsOrder,h as default};