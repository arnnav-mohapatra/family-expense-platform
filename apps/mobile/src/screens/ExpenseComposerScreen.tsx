import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { calculateSplit, type SplitMode } from "@family-expense/financial-engine";
import { theme } from "../theme";

const people = [{id:"me",name:"You"},{id:"mom",name:"Mum"},{id:"dad",name:"Dad"},{id:"sibling",name:"Sibling"}] as const;
const modes = ["EQUAL","EXACT","PERCENTAGE","SHARES"] as const;

export function ExpenseComposerScreen({ onDone = () => {} }: { onDone?: () => void }) {
  const [amount,setAmount]=useState("");
  const [description,setDescription]=useState("");
  const [mode,setMode]=useState<SplitMode>("EQUAL");
  const [selected,setSelected]=useState<string[]>(people.map(p=>p.id));
  const [values,setValues]=useState<Record<string,string>>({});
  const totalMinor=BigInt(amount.replace(/\D/g,"")||"0");
  const inputs=selected.map(userId=>({userId,value:BigInt(values[userId]||"0")}));
  const allocations=useMemo(()=>{try{return calculateSplit(totalMinor,mode,inputs)}catch{return new Map<string,bigint>()}},[totalMinor,mode,JSON.stringify(inputs)]);
  const allocated=[...allocations.values()].reduce((a,b)=>a+b,0n);
  const valid=totalMinor>0n&&selected.length>0&&allocated===totalMinor;
  const display=(minor:bigint)=>`₹${(Number(minor)/100).toFixed(2)}`;
  const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);

  return <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.page}>
    <Text style={s.kicker}>NEW EXPENSE</Text>
    <TextInput value={description} onChangeText={setDescription} placeholder="What was this for?" placeholderTextColor={theme.muted} style={s.description}/>
    <View style={s.amountBox}><Text style={s.currency}>₹</Text><TextInput value={amount} onChangeText={v=>setAmount(v.replace(/\D/g,""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.muted} style={s.amount}/></View>
    <Text style={s.section}>Paid by</Text><Pressable style={s.payer}><Text style={s.payerText}>You</Text><Text style={s.chevron}>›</Text></Pressable>
    <Text style={s.section}>Split</Text><View style={s.modes}>{modes.map(m=><Pressable key={m} onPress={()=>setMode(m)} style={[s.mode,mode===m&&s.modeActive]}><Text style={[s.modeText,mode===m&&s.modeTextActive]}>{m.charAt(0)+m.slice(1).toLowerCase()}</Text></Pressable>)}</View>
    <Text style={s.section}>Participants</Text>{people.map(p=><Pressable key={p.id} onPress={()=>toggle(p.id)} style={[s.participant,selected.includes(p.id)&&s.selected]}><View style={s.avatar}><Text>{p.name[0]}</Text></View><Text style={s.name}>{p.name}</Text>{selected.includes(p.id)&&<Text style={s.check}>✓</Text>}</Pressable>)}
    <View style={s.summary}>{selected.map(id=><View key={id} style={s.summaryRow}><Text style={s.name}>{people.find(p=>p.id===id)?.name}</Text><Text style={s.value}>{display(allocations.get(id)??0n)}</Text></View>)}</View>
    <Text style={[s.validation,valid?s.good:s.bad]}>{totalMinor===0n?"Enter an amount":valid?"Split balances perfectly":`Remaining ${display(totalMinor-allocated)}`}</Text>
    <Pressable disabled={!valid||!description.trim()} onPress={onDone} style={[s.save,(!valid||!description.trim())&&s.disabled]}><Text style={s.saveText}>Save expense</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:theme.bg},page:{padding:20,paddingBottom:48},kicker:{fontSize:11,fontWeight:"900",letterSpacing:2,color:theme.muted},
 description:{fontSize:27,fontWeight:"900",color:theme.ink,marginTop:14,marginBottom:18},amountBox:{flexDirection:"row",alignItems:"center",backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border,borderRadius:18,paddingHorizontal:18,paddingVertical:8},
 currency:{fontSize:28,fontWeight:"900",color:theme.muted},amount:{flex:1,fontSize:42,fontWeight:"900",color:theme.ink,paddingLeft:10},section:{fontSize:13,fontWeight:"900",color:theme.ink,marginTop:24,marginBottom:10},
 payer:{flexDirection:"row",justifyContent:"space-between",padding:16,borderRadius:14,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},payerText:{fontWeight:"800",color:theme.ink},chevron:{fontSize:22,color:theme.muted},
 modes:{flexDirection:"row",backgroundColor:theme.surfaceAlt,borderRadius:14,padding:4,gap:4},mode:{flex:1,paddingVertical:11,alignItems:"center",borderRadius:10},modeActive:{backgroundColor:theme.surface},modeText:{fontSize:11,fontWeight:"800",color:theme.muted},modeTextActive:{color:theme.ink},
 participant:{flexDirection:"row",alignItems:"center",padding:11,borderRadius:14,marginBottom:7,backgroundColor:theme.surface,borderWidth:1,borderColor:"transparent"},selected:{borderColor:theme.border},avatar:{width:34,height:34,borderRadius:17,backgroundColor:theme.accentSoft,alignItems:"center",justifyContent:"center"},name:{fontWeight:"800",color:theme.ink,marginLeft:10},check:{marginLeft:"auto",color:theme.accent,fontWeight:"900"},
 summary:{marginTop:12,padding:14,borderRadius:16,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.border},summaryRow:{flexDirection:"row",justifyContent:"space-between",paddingVertical:7},value:{fontWeight:"900",color:theme.ink},
 validation:{marginTop:14,fontWeight:"800"},good:{color:theme.accent},bad:{color:"#B34A4A"},save:{marginTop:24,padding:17,borderRadius:16,alignItems:"center",backgroundColor:theme.ink},disabled:{opacity:.4},saveText:{fontWeight:"900",fontSize:16,color:"#fff"}
});