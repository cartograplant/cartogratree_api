args<-commandArgs(TRUE);
# VCF Directory location not including the file name part
args[1]
# Analysis ID
args[2]

# install.packages("adegenet", repos="https://cloud.r-project.org/")
# install.packages("vcfR", repos="https://cloud.r-project.org/")

#These are the R packages needed to run DAPC
library(adegenet)
library(vcfR)

#The only input file needed is a vcf or vcf.gz file
vcf <- read.vcfR(paste(args[1],'/',args[2],'_popstruct_vcf.vcf', sep=""))
x <- vcfR2genlight(vcf) #transform vcf to genlight

#After running this step, a plot and a question is generated. This plot has to be provided to the users to help them decide the number of PCs to retain

grp <- find.clusters(x, max.n.clust=40)
Number of PCs to retain:

# For users: This function displays a graph of cumulated variance (Y axis) explained by the eigenvalues of the PCA (X axis). Apart from computational time, there is no reason for keeping a small number of components.Then, we aim to keep all the information. For instance, if the number of PCs in your plot (X axis) is 110, you should retain 200 PCs so all of them are kept

#Then, a second question and another plot. The function displays a graph of BIC values for increasing values of k. If the graph shows, for instance, a clear decrease of BIC until k = 6 clusters, after which BIC increases, in this case, the elbow in the curve also matches the smallest BIC, so 6 clusters should be retained. In practice, the choice is often trickier to make for empirical dataset.
Number of clusters to retain:

# Here, the DAPC is calculated. This step displays the same graph of cumulated variance as in find.cluster. However,unlike k-means, DAPC can benefit from not using too many PCs. Indeed, retaining too many components with respect to the number of individuals can lead to over-fitting and unstability in the membership probabilities returned by the method. DAPC is implemented by the function "dapc", which first transforms the data using PCA, and then performs a Discriminant Analysis on the retained principal components.Two graphs will appear as a result to help decide the number of principal components and the number of discriminant functions to be retained. The bottomline is therefore retaining a few PCs without sacrificing too much information. Thus, the best number of PCs to retain is the value from which the curve starts to get flatter. Once the number of PCs to retain are selected, a barplot of eigenvalues for the discriminant analysis is displayed, asking for a number of discriminant functions to retain. For small number of clusters, all eigenvalues can be retained since all discriminant functions can be examined without difficulty. Whenever more (say, tens of) clusters are analysed, it is likely that the first few dimensions will carry more information than the others, and only those can then be retained and interpreted.
dapc1 <- dapc(x, grp$grp)
Number of PCs to retain:
Number of clusters to retain:

#Plot: Select the colors for the populations in the plot (it has to be the same number of colors as the number of clusters retained in the previous step)
myCol=c("green","blue","yellow","red","orange")
scatter(dapc1, posi.da="bottomleft", bg="white",
        pch=17:22, cstar=0, col=myCol, scree.pca=TRUE,
        posi.pca="bottomright")


#Membership probabilities

#Change formatting for storage and used to correct by population structure in the GWAS with EMMAX
round<-round(dapc1$posterior,3)
assignedPop<-apply(round, 1, which.max)
assignedPopframe<-as.data.frame(assignedPop)

#Including intercept
Intercept<-rep(1,times=407)
assignedPopInter<-cbind(Intercept,assignedPopframe)

#Print table
write.table(assignedPopInter,paste(args[1],'/',args[2],"_Panel1assignedPopDAPC.txt", sep=""), col.names=F,quote=F,sep=" ")
