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

jpeg(paste(args[1],'/',args[2],'_dapc_step1_plot.jpeg', sep=""));
grp <- find.clusters(x, max.n.clust=40, choose.n.clust=FALSE)
1
1
dev.off();

print("Finished");