args<-commandArgs(TRUE);
# Analysis ID
args[1]
# Population count
args[2]
# MeanQ location file
args[3]
# famPanel location file
args[4]
# popPanel2 output location
args[5]


fs <-read.table(args[3], header=F)
fs$assignedPop <- apply(fs, 1, which.max)
intercept<-rep(1,args[2])#the second number correspond with the number of individuals in each dataset, in the case of panel 2, 882 individuals
fsintercept<-cbind(intercept,fs)
ID<-read.table(args[4])
fsID<-cbind(ID,fsintercept)
fsPop<-fsID[,c(1,2,3,6)] # the forth number is the number of ancestral populations created by fastSTRUCTURE + 4
write.table(fsPop,args[5], col.names=F,quote=F,sep=" ")