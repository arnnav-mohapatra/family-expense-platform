import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <View style={styles.wrap}>{options.map(option =>
    <Pressable key={option} onPress={() => onChange(option)} style={[styles.item, value === option && styles.active]}>
      <Text style={[styles.text, value === option && styles.activeText]}>{option.charAt(0) + option.slice(1).toLowerCase()}</Text>
    </Pressable>
  )}</View>;
}
const styles = StyleSheet.create({
  wrap:{flexDirection:"row",backgroundColor:theme.surfaceAlt,borderRadius:14,padding:4,gap:4},
  item:{flex:1,paddingVertical:11,alignItems:"center",borderRadius:10},
  active:{backgroundColor:theme.surface,shadowOpacity:.08,shadowRadius:8,shadowOffset:{width:0,height:2}},
  text:{fontSize:12,fontWeight:"800",color:theme.muted},activeText:{color:theme.ink}
});
