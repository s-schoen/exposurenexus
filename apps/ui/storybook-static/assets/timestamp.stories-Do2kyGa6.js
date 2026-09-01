import{n as e}from"./chunk-DnJy8xQt.js";import{t}from"./jsx-runtime-BX9360Lk.js";function n({timestamp:e}){let t=e instanceof Date?e:new Date(e);return Number.isNaN(t.getTime())?(0,r.jsx)(`span`,{className:`text-muted-foreground`,children:`Invalid date`}):(0,r.jsx)(`time`,{dateTime:t.toISOString(),children:t.toLocaleString()})}var r,i=e((()=>{r=t(),n.__docgenInfo={description:``,methods:[],displayName:`Timestamp`,props:{timestamp:{required:!0,tsType:{name:`union`,raw:`Date | string`,elements:[{name:`Date`},{name:`string`}]},description:``}}}})),a,o,s,c,l;e((()=>{i(),a={title:`Components/Timestamp`,component:n,parameters:{layout:`centered`},args:{timestamp:new Date(`2026-01-02T03:04:05.000Z`)}},o={},s={args:{timestamp:`2026-01-02T03:04:05.000Z`}},c={args:{timestamp:`not-a-date`}},o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{}`,...o.parameters?.docs?.source}}},s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  args: {
    timestamp: "2026-01-02T03:04:05.000Z"
  }
}`,...s.parameters?.docs?.source}}},c.parameters={...c.parameters,docs:{...c.parameters?.docs,source:{originalSource:`{
  args: {
    timestamp: "not-a-date"
  }
}`,...c.parameters?.docs?.source}}},l=[`DateValue`,`StringValue`,`InvalidDate`]}))();export{o as DateValue,c as InvalidDate,s as StringValue,l as __namedExportsOrder,a as default};