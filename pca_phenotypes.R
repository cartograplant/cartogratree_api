args<-commandArgs(TRUE);
args[1] 
# Analysis ID
args[2]

#We read the table containing the phenotypes from the file
#The CSV must have at least 3 columns (1st is the tree id, others are the phenotype data)
csv_data<-read.csv(paste(args[1],'/',args[2],'_pca_phenotypes.csv', sep=""))
#Get column count
column_count<-ncol(csv_data)
#Show head of the data from 1 to column count
head(csv_data[,1:column_count])
# This sets meta rownames (it seems - not entirely sure how to use this)
rownames(csv_data)<-csv_data[,1]
# data_values should contain the phenotype values
# this must be a vector and only occurs if there are multiple columns in the csv_data
data_values<-csv_data[,-1]

#Get rows count
row_count<-nrow(data_values);

#Select the values

data_values_subset<-data_values[c(1:column_count-1)]

#Remove the NAs
data_values_noNA<-na.omit(data_values_subset)

#Code to obtain the principal components (PCs)
data_values_noNA.pca <- prcomp(data_values_noNA, center = TRUE, scale. = TRUE)
summary(data_values_noNA.pca)
str(data_values_noNA.pca)

#install.packages("devtools", repos="https://cloud.r-project.org/")
library(devtools)
#install_github("vqv/ggbiplot")
library(ggbiplot)

#Plot the PCA
png(paste(args[1],'/',args[2],'_pca_phenotypes.png', sep="")) 
ggbiplot(data_values_noNA.pca)
dev.off();
print(paste("analysis_id:",args[2], sep=""));
