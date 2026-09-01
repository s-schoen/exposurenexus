import{a as e,n as t}from"./chunk-DnJy8xQt.js";import{a as n}from"./iframe-DOanChD-.js";import{t as r}from"./jsx-runtime-BX9360Lk.js";import{c as i,d as a,p as o}from"./common-YwcRYf10.js";import{n as s,s as c}from"./asset-custom-field-B9G1olyA.js";import{n as l,t as u}from"./asset-custom-field-fixtures-DLfaNaax.js";import{n as d,t as f}from"./asset-custom-field-detail-content-B8nnitwc.js";function p(e){let t=u.find(t=>t.type===e);if(!t)throw Error(`Missing ${e} custom field fixture`);return t}function m({customFieldId:e,customField:t,scenario:n}){let r=(0,h.useMemo)(()=>{let r=new o({defaultOptions:{queries:{retry:!1,staleTime:1/0}}});return n===`success`&&r.setQueryData([`asset-custom-fields`,e],t),r},[t,e,n]),[i,s]=(0,h.useState)(n!==`loading`&&n!==`error`);return(0,h.useLayoutEffect)(()=>{if(n===`success`){s(!0);return}let t=globalThis.fetch;return globalThis.fetch=async(r,i)=>(r instanceof Request?r.url:String(r)).endsWith(`/api/assets/custom-fields/${e}`)?n===`loading`?await new Promise(()=>{}):new Response(JSON.stringify({error:`Custom field request failed`}),{status:500,headers:{"Content-Type":`application/json`}}):t(r,i),s(!0),()=>{globalThis.fetch=t}},[e,n]),i?(0,g.jsx)(a,{client:r,children:(0,g.jsx)(`div`,{className:`w-full max-w-6xl`,children:(0,g.jsx)(f,{customFieldId:e})})}):null}var h,g,_,v,y,b,x,S,C,w,T,E;t((()=>{i(),h=e(n(),1),c(),l(),d(),g=r(),_=p(s.Select),v=p(s.Text),y=p(s.Number),b={title:`Resources/Custom Fields/Detail`,component:m,parameters:{layout:`padded`},args:{customFieldId:_.id,customField:_,scenario:`success`},render:e=>(0,g.jsx)(m,{...e})},x={},S={args:{customFieldId:v.id,customField:v}},C={args:{customFieldId:y.id,customField:y}},w={args:{scenario:`loading`}},T={args:{scenario:`error`}},x.parameters={...x.parameters,docs:{...x.parameters?.docs,source:{originalSource:`{}`,...x.parameters?.docs?.source}}},S.parameters={...S.parameters,docs:{...S.parameters?.docs,source:{originalSource:`{
  args: {
    customFieldId: TEXT_CUSTOM_FIELD.id,
    customField: TEXT_CUSTOM_FIELD
  }
}`,...S.parameters?.docs?.source}}},C.parameters={...C.parameters,docs:{...C.parameters?.docs,source:{originalSource:`{
  args: {
    customFieldId: NUMBER_CUSTOM_FIELD.id,
    customField: NUMBER_CUSTOM_FIELD
  }
}`,...C.parameters?.docs?.source}}},w.parameters={...w.parameters,docs:{...w.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "loading"
  }
}`,...w.parameters?.docs?.source}}},T.parameters={...T.parameters,docs:{...T.parameters?.docs,source:{originalSource:`{
  args: {
    scenario: "error"
  }
}`,...T.parameters?.docs?.source}}},E=[`SelectField`,`TextField`,`NumberField`,`Loading`,`ErrorState`]}))();export{T as ErrorState,w as Loading,C as NumberField,x as SelectField,S as TextField,E as __namedExportsOrder,b as default};