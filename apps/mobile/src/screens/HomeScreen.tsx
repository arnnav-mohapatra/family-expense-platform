import React,{useState} from "react";
import {Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View} from "react-native";
import {BalanceCard} from "../components/BalanceCard";
import {FloatingAddButton} from "../components/FloatingAddButton";
import {ExpenseComposerScreen} from "./ExpenseComposerScreen";
import {theme} from "../theme";

const members=[{name:"You",balanceMinor:"-18450"},{name:"Mum",balanceMinor:"9200"},{name:"Dad",balanceMinor:"9250"}];

export function HomeScreen(){
 const [selected,setSelected]=useState("Household");
 const [composer,setComposer]=useState(false);
 const [notice,setNotice]=useState("");
 if(composer)return <ExpenseComposerScreen onDone={()=>{setComposer(false);setNotice("Expense saved locally — ready to sync.");}}/>;
 return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.eyebrow}>SPACE</Text>
  <View style={styles.header}><View><Text style={styles.title}>{selected}</Text><Text style={styles.subtitle}>Everything settled, at a glance.</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>AM</Text></View></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{["Household","Trip","Friends"].map(x=><Pressable key={x} onPress={()=>setSelected(x)} style={styles.tabButton}><Text style={[styles.tab,selected===x&&styles.activeTab]}>{x}</Text></Pressable>)}</ScrollView>
  <View style={styles.hero}><Text style={styles.heroLabel}>YOUR BALANCE</Text><Text style={styles.heroAmount}>−₹184.50</Text><Text style={styles.heroHint}>You owe ₹184.50 across this space</Text></View>
  {notice?<Pressable onPress={()=>setNotice("")} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Text style={styles.noticeClose}>×</Text></Pressable>:null}
  <View style={styles.sectionHeader}><Text style={styles.section}>Balances</Text><Text style={styles.link}>View all</Text></View>
  {members.map(m=><BalanceCard key={m.name} {...m} currency="INR" onPress={()=>setNotice(`${m.name}'s balance selected`)}/>)}
  <Text style={styles.section}>Recent activity</Text>
  {[["Groceries","Today · Paid by You · Split equally","₹1,200"],["Internet","Yesterday · Paid by Mum · Monthly","₹899"]].map(([title,meta,amount])=><Pressable key={title} onPress={()=>setNotice(`${title} selected`)} style={styles.activity}><Text style={styles.activityTitle}>{title}</Text><Text style={styles.activityMeta}>{meta}</Text><Text style={styles.activityAmount}>{amount}</Text></Pressable>)}
 </ScrollView><FloatingAddButton onPress={()=>setComposer(true)}/></SafeAreaView>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:theme.bg},content:{padding:theme.space.lg,paddingBottom:110},eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:2,color:theme.muted},
 header:{marginTop:8,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},title:{fontSize:30,fontWeight:"900",color:theme.ink},subtitle:{marginTop:4,color:theme.muted},
 avatar:{width:44,height:44,borderRadius:22,backgroundColor:theme.accentSoft,alignItems:"center",justifyContent:"center"},avatarText:{fontWeight:"800",color:theme.ink},
 tabs:{gap:8,paddingVertical:20},tabButton:{paddingHorizontal:12,paddingVertical:10},tab:{fontWeight:"700",color:theme.muted,paddingBottom:7},activeTab:{color:theme.accent,borderBottomWidth:2,borderBottomColor:theme.accent},
 hero:{backgroundColor:theme.ink,borderRadius:theme.radius.lg,padding:24,marginBottom:20},heroLabel:{color:"#AAB5AE",fontSize:11,fontWeight:"800",letterSpacing:1.5},heroAmount:{color:"#fff",fontSize:38,fontWeight:"900",marginTop:8},heroHint:{color:"#CBD4CE",marginTop:6},
 notice:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:theme.accentSoft,borderRadius:14,padding:13,marginBottom:12},noticeText:{color:theme.ink,fontWeight:"700",flex:1},noticeClose:{fontSize:20,color:theme.ink,paddingHorizontal:8},
 sectionHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:12},section:{fontSize:19,fontWeight:"900",color:theme.ink,marginTop:10,marginBottom:12},link:{color:theme.accent,fontWeight:"800"},
 activity:{backgroundColor:theme.surface,borderRadius:theme.radius.md,borderWidth:1,borderColor:theme.border,padding:16,marginBottom:10},activityTitle:{fontWeight:"800",fontSize:16,color:theme.ink},activityMeta:{fontSize:12,color:theme.muted,marginTop:5},activityAmount:{fontSize:17,fontWeight:"900",marginTop:10,color:theme.ink}
});